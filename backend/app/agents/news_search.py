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
        logger.info("[LIVE NEWS TEST] raw_json=%.500s", raw)
        digest = NewsDigest.model_validate(llm._extract_json(raw))
        if not digest.items:
            logger.info("[LIVE NEWS TEST] NewsDigest is empty — FAIL")
        else:
            urgent_count = sum(1 for i in digest.items if i.is_urgent)
            urls = [i.url for i in digest.items]
            logger.info(
                "[LIVE NEWS TEST] items=%d urgent=%d urls=%s",
                len(digest.items), urgent_count, urls,
            )
            for item in digest.items:
                logger.info(
                    "[LIVE NEWS TEST] item headline=%r url=%r is_urgent=%s",
                    item.headline, item.url, item.is_urgent,
                )
            logger.info(
                "[LIVE NEWS TEST] %s",
                "PASS — at least one urgent item" if urgent_count > 0 else "FAIL — no urgent items",
            )
        return digest
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("News digest parse failed, continuing without news: %s", exc)
        return NewsDigest()
    except Exception as exc:  # API/network — news is an input, not a hard dependency
        logger.error("News search failed, continuing without news: %s", exc)
        return NewsDigest()
