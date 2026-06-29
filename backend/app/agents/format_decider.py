"""Reel/Post decision agent — chooses format (and carousel-ness for posts)."""

import logging
from datetime import datetime
from typing import Any

from app.agents import context, llm
from app.config import get_settings
from app.schemas import FormatDecision

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You decide the best Instagram format for a topic for an exam-prep account "
    "(JEE/NEET/CUET/GUJCET aspirants).\n"
    "- 'reel' — when the topic benefits from a person explaining to camera "
    "(motivation, strategy walkthroughs, news explainers). Reels are shot manually "
    "by a real person from a 1-minute script, so only choose reel when presenter "
    "delivery clearly adds value.\n"
    "- 'post' — static image(s) with caption. Set is_carousel=true only when the "
    "content naturally needs multiple frames (step-by-step tips, multi-point lists, "
    "PYQ question→solution). Single image otherwise.\n"
    "Default to 'post' when unsure — reels cost human shooting time."
)


async def decide_format(topic: dict[str, Any], now: datetime) -> FormatDecision:
    s = get_settings()
    system = context.current_context(now) + "\n\n" + _SYSTEM
    user = (
        f"Topic: {topic['title']}\n"
        f"Description: {topic.get('description') or ''}\n"
        "Decide the format."
    )
    decision = await llm.complete_json(s.critic_provider, s.critic_model, system, user, FormatDecision)
    logger.info(
        "[CAROUSEL-TRACE 1/6] format_decider — format=%s is_carousel=%s topic=%r",
        decision.format, decision.is_carousel, topic.get("title", "")[:80],
    )
    return decision
