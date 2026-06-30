"""Competitor Intelligence — daily theme analysis of tracked competitor accounts.

Uses Claude web search to extract post THEMES from public Instagram competitor accounts.
Also reads ExamBro's recent post history so gaps are identified relative to both.

Rules enforced here:
- Extract themes only — never titles, captions, or specific wording.
- Compare against ExamBro's own recent posts to surface true uncovered gaps.
- Failure-tolerant: always returns an empty CompetitorDigest on any error.
- Skips silently when no competitor handles are configured.
"""

import json
import logging
from datetime import datetime
from typing import Any

from app.agents import context, llm
from app.db import get_db
from app.schemas import CompetitorDigest, CompetitorTheme

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are a social media intelligence analyst for an Indian exam-prep brand (ExamBro). "
    "Analyse recent Instagram activity from competitor exam-prep accounts and extract "
    "THEMES ONLY — never copy post titles, captions, or specific wording.\n\n"
    "DEFINITIONS:\n"
    "- Trending theme: a broad topic appearing in posts across 2+ competitor accounts "
    "in the last 14 days\n"
    "- Content gap: an exam-prep topic you would expect these accounts to cover but "
    "they are NOT — especially if ExamBro's own recent posts also skip it\n"
    "- Overused topic: a theme so saturated across competitors this week that posting "
    "it now looks like following the crowd — best avoided\n\n"
    "RULES:\n"
    "- Themes must be generic (e.g. 'JEE Maths error analysis', 'NEET Biology revision ')\n"
    "- Only flag themes visible in the last 14 days\n"
    "- Max 5 trending themes, 5 content gaps, 3 overused topics\n\n"
    "Respond with ONLY this JSON (no prose, no code fences):\n"
    '{"trending_themes": [{"theme": "...", "handle_count": N}], '
    '"content_gaps": ["..."], "overused_topics": ["..."]}'
)


def _load_exambro_recent_topics(limit: int = 14) -> list[str]:
    """Return titles of ExamBro's most recently picked topics for gap detection."""
    try:
        rows = (
            get_db()
            .table("topics")
            .select("title")
            .eq("status", "picked")
            .order("round_date", desc=True)
            .limit(limit)
            .execute()
            .data
        )
        return [r["title"] for r in rows if r.get("title")]
    except Exception:
        return []


async def fetch_competitor_trends(
    settings_row: dict[str, Any], now: datetime
) -> CompetitorDigest:
    """Fetch and summarise competitor post themes. Returns empty digest on any failure.

    Skips silently when no competitor handles are configured in Settings.
    """
    handles: list[str] = [
        h.strip() for h in (settings_row.get("competitor_handles") or []) if h.strip()
    ]
    if not handles:
        return CompetitorDigest()

    handles_str = ", ".join(f"@{h.lstrip('@')}" for h in handles)
    exambro_recent = _load_exambro_recent_topics()

    exambro_block = ""
    if exambro_recent:
        topics_list = "\n".join(f"- {t}" for t in exambro_recent)
        exambro_block = (
            f"\n\nExamBro's own recent post topics (last {len(exambro_recent)} posts — "
            "use this to identify REAL gaps neither we nor competitors have covered):\n"
            + topics_list
        )

    try:
        system = context.current_context(now) + "\n\n" + _SYSTEM
        user = (
            f"Analyse recent Instagram posts (last 14 days) from these Indian exam-prep "
            f"competitor accounts: {handles_str}\n\n"
            "Search for what topics and themes they are currently posting about. Then:\n"
            "1. Identify trending themes — broad topics appearing across 2+ of these accounts\n"
            "2. Identify content gaps — exam-prep topics ABSENT from these competitor accounts "
            "(prioritise topics ExamBro has also not covered recently)\n"
            "3. Flag overused topics — themes so saturated this week they should be avoided"
            + exambro_block
            + "\n\nReturn the structured JSON summary."
        )
        raw = await llm.claude_web_search(system, user)
        digest = CompetitorDigest.model_validate(llm._extract_json(raw))
        logger.info(
            "[COMPETITOR TEST] handles=%s trending_themes=%s content_gaps=%s overused_topics=%s",
            handles,
            [t.theme for t in digest.trending_themes],
            digest.content_gaps,
            digest.overused_topics,
        )
        return digest
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Competitor digest parse failed, skipping: %s", exc)
        return CompetitorDigest()
    except Exception as exc:
        logger.error("Competitor fetch failed, skipping: %s", exc)
        return CompetitorDigest()
