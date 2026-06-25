"""News research — Claude agentic web search (no fixed RSS feeds, spec §2)."""

import json
import logging
from datetime import datetime

from app.agents import context, llm
from app.schemas import NewsDigest

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are a news researcher for an Indian exam-prep Instagram account. "
    "Search the web for the LATEST news about these exams: JEE Mains, JEE Advanced, "
    "NEET, CUET, GUJCET — exam dates, official notifications, admit cards, results, "
    "syllabus or pattern changes, counselling updates. Prefer official sources "
    "(nta.ac.in, jeemain.nta.nic.in, neet.nta.nic.in, gseb.org) and reputable news outlets. "
    "Discard any news older than 14 days from today's date. "
    "Mark an item is_urgent=true only for time-sensitive announcements students must "
    "act on within days (registration deadlines, admit card releases, exam date changes). "
    "After searching, respond with ONLY a JSON object: "
    '{"items": [{"headline": str, "summary": str, "url": str, "exam": str, '
    '"is_urgent": bool}]}. No prose around the JSON.'
)


async def fetch_exam_news(now: datetime) -> NewsDigest:
    """Pull today's exam news. Failure-tolerant: empty digest, never a crashed round."""
    try:
        system = context.current_context(now) + "\n\n" + _SYSTEM
        month_year = f"{now.strftime('%B')} {now.year}"
        user = (
            f"Find the latest exam news from {month_year}. "
            "Only include items from the last 14 days. "
            "Prefer official sources (nta.ac.in, jeemain.nta.nic.in, "
            "neet.nta.nic.in, gseb.org)."
        )
        raw = await llm.claude_web_search(system, user)
        return NewsDigest.model_validate(llm._extract_json(raw))
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("News digest parse failed, continuing without news: %s", exc)
        return NewsDigest()
    except Exception as exc:  # API/network — news is an input, not a hard dependency
        logger.error("News search failed, continuing without news: %s", exc)
        return NewsDigest()
