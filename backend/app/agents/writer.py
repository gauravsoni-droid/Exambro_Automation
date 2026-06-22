"""Writer — drafts caption + hashtags (+ reel script) in the content language.

Model = Phase-0 bake-off winner (config). Language is a parameter, never
hard-coded (TRD §3 hard requirement). Few-shot from real ExamBro posts.
"""

from typing import Any

from app.agents import context, llm
from app.config import get_settings
from app.schemas import Draft, PostFormat

CTA_DEFAULT = "Download ExamBro app — link in bio."


def _system_prompt(
    language: str,
    format_: PostFormat,
    settings_row: dict[str, Any],
    pillar: dict[str, Any] | None = None,
) -> str:
    lang_name = context.LANGUAGE_NAMES.get(language, language)
    allowlist = settings_row.get("english_allowlist") or []
    script_part = ""
    if format_ == PostFormat.reel:
        script_part = (
            "\nThis is a REEL: also write `script` — a 1-minute presenter-voice script "
            f"in {lang_name}, spoken naturally to camera by a real person (not the owner). "
            "Structure: hook (first 3 seconds) → value → CTA. Mark pauses/emphasis sparingly."
        )
    pillar_block = ""
    if pillar:
        pillar_block = (
            f"CONTENT PILLAR: {pillar['name']}"
            + (f" — {pillar['description']}" if pillar.get("description") else "")
            + "\nWrite content that fits this pillar's theme.\n\n"
        )
    return (
        f"You are ExamBro's Instagram content writer. Write in {lang_name}.\n\n"
        f"{context.language_rule(language, allowlist)}\n\n"
        f"{context.brand_voice_block()}\n\n"
        f"{context.business_foundation_block(settings_row)}\n\n"
        f"{context.target_audience_block(settings_row)}\n\n"
        f"{context.never_post_block(settings_row)}\n\n"
        f"{pillar_block}"
        f"{context.few_shot_block()}\n\n"
        "OUTPUT:\n"
        "- caption: scroll-stopping hook in the first line, clear value, short paragraphs, "
        f'CTA at the end (default: "{CTA_DEFAULT}").\n'
        "- hashtags: 8–15 relevant hashtags (hashtags stay in English/Latin script), "
        "mix of broad exam tags and specific topic tags."
        f"{script_part}"
    )


async def write_draft(
    topic: dict[str, Any],
    format_: PostFormat,
    language: str,
    settings_row: dict[str, Any],
    revision_instructions: str = "",
    previous_draft: Draft | None = None,
) -> Draft:
    """First draft, critic-revision, and owner-tweak all flow through here."""
    s = get_settings()
    user = (
        f"Topic: {topic['title']}\n"
        f"Description: {topic.get('description') or ''}\n"
        f"Format: {format_.value}"
    )
    if previous_draft is not None:
        user += (
            f"\n\nPREVIOUS DRAFT:\nCaption: {previous_draft.caption}\n"
            f"Hashtags: {' '.join(previous_draft.hashtags)}\n"
            + (f"Script: {previous_draft.script}\n" if previous_draft.script else "")
            + f"\nREVISE IT — instructions:\n{revision_instructions}"
        )
    else:
        user += "\n\nWrite the draft."

    active_pillars = context.load_active_pillars()
    pillar = next((p for p in active_pillars if p["id"] == topic.get("pillar_id")), None)
    return await llm.complete_json(
        s.writer_provider,
        s.writer_model,
        _system_prompt(language, format_, settings_row, pillar),
        user,
        Draft,
    )
