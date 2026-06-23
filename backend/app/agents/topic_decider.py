"""Topic Decider — merges signals into 3 topic suggestions (Appflow §2).

Rules enforced here, not just in the prompt:
- 3 topics from 3 DIFFERENT pillars, excluding yesterday's picked pillar.
- A pending owner idea always takes slot 1 (wins regardless of rotation).
- Urgent exam news may break rotation — flagged is_rotation_exception.
"""

import json
import logging
from typing import Any

from app.agents import context, llm
from app.config import get_settings
from app.schemas import NewsDigest, TopicRound

logger = logging.getLogger(__name__)


def _validate_round(
    round_: TopicRound, allowed_pillar_ids: set[str], idea: dict[str, Any] | None
) -> None:
    non_exception = [t for t in round_.topics if not t.is_rotation_exception]
    pillar_ids = [t.pillar_id for t in round_.topics]
    if len(set(pillar_ids)) != 3:
        raise ValueError(f"Topics must use 3 different pillars, got: {pillar_ids}")
    bad = [p for t in non_exception for p in [t.pillar_id] if p not in allowed_pillar_ids]
    if bad:
        raise ValueError(f"Non-exception topics used excluded/unknown pillars: {bad}")


async def decide_topics(
    pillars: list[dict[str, Any]],
    yesterdays_pillar_id: str | None,
    pending_idea: dict[str, Any] | None,
    news: NewsDigest,
    settings_row: dict[str, Any],
    rejected_titles: list[str] | None = None,
) -> TopicRound:
    s = get_settings()
    allowed = [p for p in pillars if p["id"] != yesterdays_pillar_id]
    allowed_ids = {p["id"] for p in allowed}

    pillar_lines = "\n".join(
        f'- id={p["id"]} · "{p["name"]}" — {p.get("description") or ""}' for p in allowed
    )
    news_block = (
        "\n".join(
            f"- [{'URGENT' if n.is_urgent else n.exam or 'news'}] {n.headline} — "
            f"{n.summary} ({n.url})"
            for n in news.items
        )
        or "(no fresh news today)"
    )

    idea_block = ""
    if pending_idea:
        idea_block = (
            f"\nOWNER IDEA (type={pending_idea['type']}): {pending_idea['payload']}\n"
            "Shape this idea into a proper topic and put it in SLOT 1. It wins regardless "
            "of pillar rotation — tag it with whichever allowed pillar fits best."
        )

    rejected_block = ""
    if rejected_titles:
        rejected_block = (
            "\nThe owner REJECTED these suggestions today — propose genuinely different "
            "angles:\n" + "\n".join(f"- {t}" for t in rejected_titles)
        )

    system = (
        "You are the topic strategist for ExamBro (@exambro.app), an Instagram account "
        "for JEE Mains / JEE Advanced / NEET / CUET / GUJCET aspirants and their teachers. "
        "Suggest exactly 3 Instagram post topics for today.\n\n"
        "RULES:\n"
        "- The 3 topics MUST come from 3 DIFFERENT pillars (use pillar ids from the list).\n"
        "- Only use pillars from the allowed list below.\n"
        "- Each topic: short title + one-line description. Concrete and postable today, "
        "not generic.\n"
        "- If a news item is truly urgent, you may base a topic on it even if rotation "
        "suffers — set is_rotation_exception=true on that topic and cite the URL in "
        "source_refs.\n"
        f"\nALLOWED PILLARS (yesterday's pillar already excluded):\n{pillar_lines}\n"
        f"\n{context.business_foundation_block(settings_row)}\n"
        f"{context.target_audience_block(settings_row)}\n"
        f"\nTODAY'S EXAM NEWS:\n{news_block}"
        f"{idea_block}{rejected_block}"
    )

    round_ = await llm.complete_json(
        s.news_provider,
        s.news_model,
        system,
        "Generate today's 3 topic suggestions.",
        TopicRound,
    )
    try:
        _validate_round(round_, allowed_ids, pending_idea)
    except ValueError as exc:
        logger.warning("Topic round invalid (%s) — one retry", exc)
        round_ = await llm.complete_json(
            s.news_provider,
            s.news_model,
            system,
            f"Generate today's 3 topic suggestions. Previous attempt was invalid: {exc}",
            TopicRound,
        )
        _validate_round(round_, allowed_ids, pending_idea)
    return round_


def parse_news_json(raw: str) -> NewsDigest:
    try:
        return NewsDigest.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValueError):
        return NewsDigest()
