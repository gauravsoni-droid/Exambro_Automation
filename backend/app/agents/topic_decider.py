"""Topic Decider — merges signals into 3 topic suggestions (Appflow §2).

Rules enforced here, not just in the prompt:
- 3 topics from 3 DIFFERENT pillars, excluding yesterday's picked pillar.
- A pending owner idea always takes slot 1 (wins regardless of rotation).
- Urgent exam news may break rotation — flagged is_rotation_exception.
"""

import json
import logging
import re
from datetime import datetime
from typing import Any

from app.agents import context, llm
from app.config import get_settings
from app.schemas import (
    AdaptiveContext,
    CompetitorDigest,
    NewsDigest,
    PerformanceDigest,
    TopicDecisionTrace,
    TopicRound,
    TopicSuggestion,
)

logger = logging.getLogger(__name__)

_SUPPORTED_EXAMS = ("JEE", "NEET", "CUET", "GUJCET")

_EXAM_KEYWORDS: dict[str, list[str]] = {
    "JEE":    ["jee", "iit"],
    "NEET":   ["neet", "mbbs", "aiims"],
    "CUET":   ["cuet"],
    "GUJCET": ["gujcet"],
}


def detect_exam(title: str, description: str | None = None) -> str | None:
    """Return the exam name detected from topic text via keyword matching, or None.

    Order in _EXAM_KEYWORDS is the tie-break when multiple exams appear in one topic
    (rare; the first match wins).
    """
    text = f"{title} {description or ''}".lower()
    for exam, keywords in _EXAM_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            return exam
    return None


_STOPWORDS = frozenset({
    "a", "an", "the", "is", "are", "was", "be", "been",
    "to", "for", "in", "on", "of", "and", "or", "but",
    "with", "from", "by", "at", "this", "that", "it",
    "post", "share", "today", "make", "create", "do",
    "get", "how", "what", "when", "who", "why", "tell",
    "write", "about", "some", "all", "than", "students",
})

# Signal 1: normalized Jaccard on title alone (high-precision gate).
# 0.7 catches word-for-word rephrasing while allowing same-exam topics with different angles
# ("NEET Prep Tips" vs "JEE Prep Tips" scores 0.67, just under the bar).
_TITLE_THRESHOLD = 0.7

# Signal 2: overlap coefficient on combined (title + description) normalized text.
# Uses |A∩B| / min(|A|,|B|) — measures "how much of the smaller topic is contained in the larger
# one", which is more sensitive to short titles buried in longer descriptions.
# Only fires when title_sim ≥ _TITLE_GUARD so fully unrelated descriptions don't trigger it.
_COMBINED_THRESHOLD = 0.55
_TITLE_GUARD = 0.3

# Domain synonym map — collapses the most common exam-prep vocabulary variants so that
# "strategy/tricks/guide" all normalize to "tips", "analysis/analyzing" → "review", etc.
# Kept conservative: only unambiguous, high-frequency synonyms to avoid false positives.
_SYNONYMS: dict[str, str] = {
    "preparation": "prep",
    "prepare": "prep",
    "preparing": "prep",
    "strategy": "tips",
    "strategies": "tips",
    "trick": "tips",
    "tricks": "tips",
    "analysis": "review",
    "analyzing": "review",
    "results": "result",
    "cutoffs": "cutoff",
    "registration": "register",
    "deadline": "date",
    "dates": "date",
    "schedule": "date",
}


def _sig_tokens(text: str) -> set[str]:
    """Significant word tokens — non-digit Unicode letters > 2 chars, stopwords removed."""
    return {
        w for w in re.findall(r"[^\W\d_]+", text.lower(), re.UNICODE)
        if len(w) > 2 and w not in _STOPWORDS
    }


def _normalized_tokens(text: str) -> set[str]:
    """Like _sig_tokens but with synonym normalization applied."""
    return {_SYNONYMS.get(w, w) for w in _sig_tokens(text)}


def _combined_fingerprint(title: str, description: str | None) -> set[str]:
    """Normalized token set for title + description together."""
    return _normalized_tokens(f"{title} {description or ''}")


def _validate_no_duplicates(round_: TopicRound, prior_topics: list[dict]) -> None:
    """Raise ValueError if any proposed topic is semantically too close to a recent one.

    Two signals are computed for every (new topic, prior topic) pair:

    Signal 1 — Normalized title Jaccard (≥ 0.7):
        Fires when titles share the majority of significant tokens after synonym normalization.
        Catches direct rephrasing: "JEE Main Registration Tips" ≈ "JEE Main Registration Guide"
        (both normalize to {jee, main, register, tips} → Jaccard 1.0).

    Signal 2 — Combined overlap coefficient (≥ 0.55, guarded by title_sim ≥ 0.3):
        Uses |A∩B| / min(|A|,|B|) on the full title+description token set.
        Catches cases where titles look different but descriptions reveal the same core idea:
        "NEET Biology Strategy" / "Master NEET biology … high-weightage chapters"
        ≈ "NEET Biology Tips" / "Best tips for NEET biology … important chapters"
        → combined overlap 0.60 → caught even though title Jaccard is only 0.33.
    """
    for t in round_.topics:
        new_title_tok = _normalized_tokens(t.title)
        new_combined = _combined_fingerprint(t.title, t.description)

        for prior in prior_topics:
            prior_title: str = prior["title"]
            prior_desc: str | None = prior.get("description")
            prior_title_tok = _normalized_tokens(prior_title)
            prior_combined = _combined_fingerprint(prior_title, prior_desc)

            title_inter = new_title_tok & prior_title_tok
            title_union = new_title_tok | prior_title_tok
            title_sim = len(title_inter) / max(len(title_union), 1)

            # Signal 1
            if title_sim >= _TITLE_THRESHOLD:
                logger.info(
                    "Duplicate [title] '%s' ~ '%s' title_sim=%.0f%% shared=%s",
                    t.title, prior_title, title_sim * 100, sorted(title_inter),
                )
                raise ValueError(
                    f"Topic '{t.title}' duplicates recent topic '{prior_title}' "
                    f"(title similarity {title_sim:.0%}, "
                    f"shared: {', '.join(sorted(title_inter))}) "
                    "— suggest a genuinely different angle"
                )

            # Signal 2 — only when topics are in the same ballpark
            if title_sim >= _TITLE_GUARD and new_combined and prior_combined:
                common = new_combined & prior_combined
                combined_sim = len(common) / min(len(new_combined), len(prior_combined))
                if combined_sim >= _COMBINED_THRESHOLD:
                    logger.info(
                        "Duplicate [combined] '%s' ~ '%s' "
                        "combined_sim=%.0f%% title_sim=%.0f%% shared=%s",
                        t.title, prior_title, combined_sim * 100,
                        title_sim * 100, sorted(common),
                    )
                    raise ValueError(
                        f"Topic '{t.title}' covers the same idea as recent topic "
                        f"'{prior_title}' "
                        f"(combined overlap {combined_sim:.0%}, "
                        f"shared concepts: {', '.join(sorted(common))}) "
                        "— suggest a genuinely different angle"
                    )


def idea_matches(payload: str, topic: TopicSuggestion) -> bool:
    """Return True if the topic semantically represents the owner idea.

    Uses significant-word overlap plus a 5-character prefix stem check so that
    inflected forms ("registration"/"register", "cutoff"/"cutoffs") still match.
    Fast, deterministic, no LLM call.

    Returns True when the idea payload has no significant words (can't reject).
    """
    def _tokens(text: str) -> set[str]:
        # Unicode letters only — handles Devanagari and Latin scripts
        return {
            w for w in re.findall(r"[^\W\d_]+", text.lower(), re.UNICODE)
            if len(w) > 2 and w not in _STOPWORDS
        }

    idea_tokens = _tokens(payload)
    if not idea_tokens:
        return True  # nothing meaningful in the payload — cannot reject

    topic_tokens = _tokens(f"{topic.title} {topic.description or ''}")

    if idea_tokens & topic_tokens:
        return True

    # Prefix stem: "registration"/"register", "motivat*", "analys*", etc.
    for iw in idea_tokens:
        if len(iw) < 5:
            continue
        for tw in topic_tokens:
            if len(tw) >= 5 and iw[:5] == tw[:5]:
                return True

    return False


def _validate_exam_variety(round_: TopicRound) -> None:
    """Raise ValueError when all 3 topics target the same exam without breaking news.

    Only fires when every topic has a detectable exam AND they all match the same one.
    Topics with no detectable exam keyword are ignored (they're generic/multi-exam).
    Breaking news (is_rotation_exception=True) on any topic exempts the whole round.
    """
    if any(t.is_rotation_exception for t in round_.topics):
        return
    exams = [detect_exam(t.title, t.description) for t in round_.topics]
    detected = [e for e in exams if e is not None]
    if len(detected) == len(round_.topics) and len(set(detected)) == 1:
        raise ValueError(
            f"All 3 topics target {detected[0]} — spread across "
            "JEE / NEET / CUET / GUJCET in slots 2–3 or mark breaking news"
        )


def _validate_round(
    round_: TopicRound,
    allowed_pillar_ids: set[str],
    all_pillar_ids: set[str],
    idea: dict[str, Any] | None,
    prior_topics: list[dict] | None = None,
) -> None:
    slot1 = round_.topics[0]
    pillar_ids = [t.pillar_id for t in round_.topics]

    # 1. Always: 3 topics from 3 different pillars
    if len(set(pillar_ids)) != 3:
        raise ValueError(f"Topics must use 3 different pillars, got: {pillar_ids}")

    # 2. Owner idea: slot 1 must represent the idea and may use any known pillar
    if idea:
        if not idea_matches(idea["payload"], slot1):
            raise ValueError(
                f"Owner idea not represented in slot 1. "
                f"Idea: '{idea['payload'][:80]}' | Slot 1: '{slot1.title}'"
            )
        if slot1.pillar_id not in all_pillar_ids:
            raise ValueError(f"Slot 1 (idea) references unknown pillar: {slot1.pillar_id}")
    else:
        # No idea: slot 1 is a normal topic, subject to rotation
        if not slot1.is_rotation_exception and slot1.pillar_id not in allowed_pillar_ids:
            raise ValueError(f"Slot 1 used excluded/unknown pillar: {slot1.pillar_id}")

    # 3. Slots 2 and 3: normal rotation rules apply
    for t in round_.topics[1:]:
        if t.is_rotation_exception:
            continue
        if t.pillar_id not in allowed_pillar_ids:
            raise ValueError(
                f"Topic '{t.title}' used excluded/unknown pillar: {t.pillar_id}"
            )

    # 4. Exam variety: don't cluster all 3 topics on the same exam
    _validate_exam_variety(round_)

    # 5. No duplicates of recent/historical topics
    if prior_topics:
        _validate_no_duplicates(round_, prior_topics)


async def decide_topics(
    pillars: list[dict[str, Any]],
    yesterdays_pillar_id: str | None,
    pending_idea: dict[str, Any] | None,
    news: NewsDigest,
    settings_row: dict[str, Any],
    now: datetime,
    rejected_titles: list[str] | None = None,
    competitor_digest: CompetitorDigest | None = None,
    performance_digest: PerformanceDigest | None = None,
    adaptive_context: AdaptiveContext | None = None,
    prior_topics: list[dict] | None = None,
) -> TopicRound:
    s = get_settings()
    all_ids = {p["id"] for p in pillars}
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

    prior_block = ""
    if prior_topics:
        lines = []
        for p in prior_topics:
            line = f"- {p['title']}"
            if p.get("description"):
                line += f": {p['description']}"
            lines.append(line)
        prior_block = (
            "\nRECENT TOPICS (last 30 days — do not repeat or closely rephrase "
            "even if the wording differs):\n" + "\n".join(lines)
        )

    liked_block = context.liked_topics_block(settings_row)
    never_topics = context.never_post_topics_block(settings_row)
    adaptive_block = (
        context.adaptive_strategy_block(adaptive_context) if adaptive_context else ""
    )
    perf_block = (
        context.performance_block(performance_digest) if performance_digest else ""
    )
    comp_block = (
        context.competitor_trends_block(competitor_digest) if competitor_digest else ""
    )
    extra_blocks = (f"\n{liked_block}\n" if liked_block else "") + (
        f"\n{never_topics}\n" if never_topics else ""
    )

    system = (
        context.current_context(now) + "\n\n"
        "You are the topic strategist for ExamBro (@exambro.app), an Instagram account "
        "for JEE Mains / JEE Advanced / NEET / CUET / GUJCET aspirants and their teachers. "
        "Suggest exactly 3 Instagram post topics for today.\n\n"
        "RULES:\n"
        "- The 3 topics MUST come from 3 DIFFERENT pillars (use pillar ids from the list).\n"
        "- Each topic: short title + one-line description. Concrete and postable today, "
        "not generic.\n"
        "- If a news item is truly urgent, you may base a topic on it even if rotation "
        "suffers — set is_rotation_exception=true on that topic and cite the URL in "
        "source_refs.\n"
        "- Spread exams across topics: if slot 1 targets JEE, prefer NEET / CUET / GUJCET "
        "for slots 2-3. Only cluster all 3 on one exam when urgent breaking news justifies it.\n"
        f"\nALLOWED PILLARS (yesterday's pillar already excluded):\n{pillar_lines}\n"
        f"\n{context.business_foundation_block(settings_row)}\n"
        f"{context.target_audience_block(settings_row)}\n"
        f"{extra_blocks}"
        + (f"\n{adaptive_block}\n" if adaptive_block else "")
        + (f"\n{perf_block}\n" if perf_block else "")
        + (f"\n{comp_block}\n" if comp_block else "")
        + (f"\n{prior_block}\n" if prior_block else "")
        + f"\nTODAY'S EXAM NEWS:\n{news_block}"
        + f"{idea_block}{rejected_block}"
    )

    round_ = await llm.complete_json(
        s.news_provider,
        s.news_model,
        system,
        "Generate today's 3 topic suggestions.",
        TopicRound,
    )
    try:
        _validate_round(round_, allowed_ids, all_ids, pending_idea, prior_topics)
    except ValueError as exc:
        logger.warning("Topic round invalid (%s) — one retry", exc)
        round_ = await llm.complete_json(
            s.news_provider,
            s.news_model,
            system,
            f"Generate today's 3 topic suggestions. Previous attempt was invalid: {exc}",
            TopicRound,
        )
        _validate_round(round_, allowed_ids, all_ids, pending_idea, prior_topics)
    return round_


def _build_trace(
    topic: TopicSuggestion,
    slot: int,
    pillar_name: str | None,
    pending_idea: dict[str, Any] | None,
    settings_row: dict[str, Any],
    performance_digest: PerformanceDigest | None,
    competitor_digest: CompetitorDigest | None,
    adaptive_context: AdaptiveContext | None,
) -> TopicDecisionTrace:
    reasons: list[str] = []

    owner_idea = bool(pending_idea and slot == 1)
    if owner_idea:
        reasons.append("Built from your submitted idea — always placed in slot 1")

    breaking_news = topic.is_rotation_exception
    if breaking_news:
        reasons.append("Urgent breaking news detected — bypasses normal pillar rotation")

    adaptive_strategy = adaptive_context is not None
    exam_phase = adaptive_context.phase.value if adaptive_context else None
    if adaptive_strategy and adaptive_context is not None:
        phase_label = adaptive_context.phase.value.replace("_", " ").title()
        if adaptive_context.days_to_exam is not None:
            reasons.append(
                f"Adaptive strategy: {phase_label} phase — "
                f"{adaptive_context.nearest_exam_name} in {adaptive_context.days_to_exam} days"
            )
        elif adaptive_context.days_since_exam is not None:
            reasons.append(
                f"Adaptive strategy: {phase_label} phase — "
                f"{adaptive_context.nearest_exam_name} "
                f"{adaptive_context.days_since_exam} days ago"
            )
        else:
            reasons.append(f"Adaptive strategy: {phase_label} phase applied")

    performance_signal = bool(
        performance_digest
        and performance_digest.total_posts_analyzed >= 5
        and (
            performance_digest.strong_pillars
            or performance_digest.weak_pillars
            or performance_digest.high_performing_topics
        )
    )
    if performance_signal:
        if pillar_name and performance_digest and pillar_name in (performance_digest.strong_pillars or []):
            reasons.append(
                f"Performance signal: '{pillar_name}' consistently resonates with your audience"
            )
        else:
            reasons.append("Performance signal: recent engagement patterns applied")

    competitor_signal = bool(
        competitor_digest
        and (
            competitor_digest.trending_themes
            or competitor_digest.content_gaps
            or competitor_digest.overused_topics
        )
    )
    if competitor_signal:
        reasons.append("Competitor analysis: market gaps and trends considered")

    business_foundation = bool(
        settings_row.get("bf_brand_name")
        or settings_row.get("bf_who_we_serve")
        or settings_row.get("bf_core_values")
        or settings_row.get("bf_liked_topics")
        or settings_row.get("bf_never_post")
    )
    if business_foundation:
        reasons.append("Brand identity and audience context applied")

    if not owner_idea and not breaking_news:
        reasons.append(
            f"Pillar rotation: selected from the '{pillar_name or 'content'}' pillar"
        )

    return TopicDecisionTrace(
        pillar_name=pillar_name,
        selection_reasons=reasons,
        owner_idea=owner_idea,
        breaking_news=breaking_news,
        business_foundation=business_foundation,
        performance_signal=performance_signal,
        competitor_signal=competitor_signal,
        adaptive_strategy=adaptive_strategy,
        exam_phase=exam_phase,
    )


def build_traces(
    round_: TopicRound,
    pillars: list[dict[str, Any]],
    pending_idea: dict[str, Any] | None,
    settings_row: dict[str, Any],
    performance_digest: PerformanceDigest | None,
    competitor_digest: CompetitorDigest | None,
    adaptive_context: AdaptiveContext | None,
) -> list[TopicDecisionTrace]:
    """Build one decision trace per topic deterministically from signal inputs.

    Called after decide_topics() returns — never touches the LLM.
    """
    pillar_name_map = {p["id"]: p["name"] for p in pillars}
    return [
        _build_trace(
            topic=t,
            slot=slot,
            pillar_name=pillar_name_map.get(t.pillar_id or ""),
            pending_idea=pending_idea,
            settings_row=settings_row,
            performance_digest=performance_digest,
            competitor_digest=competitor_digest,
            adaptive_context=adaptive_context,
        )
        for slot, t in enumerate(round_.topics, start=1)
    ]


def parse_news_json(raw: str) -> NewsDigest:
    try:
        return NewsDigest.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValueError):
        return NewsDigest()
