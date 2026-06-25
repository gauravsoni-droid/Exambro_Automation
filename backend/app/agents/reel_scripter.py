"""Reel Scripter — finalizes the 1-minute presenter-voice script (Hindi).

The writer⇄critic loop already produced a passing script draft; this step
polishes it into a shoot-ready format for the real person who films it.
"""

from datetime import datetime
from typing import Any

from app.agents import context, llm
from app.config import get_settings


async def finalize_script(
    script: str,
    topic: dict[str, Any],
    language: str,
    settings_row: dict[str, Any],
    now: datetime | None = None,
) -> str:
    s = get_settings()
    lang_name = context.LANGUAGE_NAMES.get(language, language)
    allowlist = settings_row.get("english_allowlist") or []
    ta_block = context.target_audience_block(settings_row)
    ctx_block = context.current_context(now) + "\n\n" if now is not None else ""
    system = (
        ctx_block
        + f"You format Instagram reel scripts for shooting. The script is in {lang_name} "
        "and was already quality-approved — do NOT rewrite the content.\n"
        f"{context.language_rule(language, allowlist)}\n\n"
        + (f"{ta_block}\n\n" if ta_block else "")
        + "Produce a shoot-ready 1-minute script: short numbered beats, each with the "
        "exact line to speak; [pause]/[emphasis] cues sparingly; total ≈140–160 spoken "
        "words (fits 60 seconds). The presenter is a real person, not the owner. "
        "Return ONLY the formatted script text."
    )
    user = f"Topic: {topic['title']}\n\nApproved script draft:\n{script}"
    return (await llm.complete(s.writer_provider, s.writer_model, system, user)).strip()
