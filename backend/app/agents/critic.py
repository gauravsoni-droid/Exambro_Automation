"""Critic — strict rubric scoring, different model family from the writer.

Trusted to run automatically only after the Phase-0 accuracy test (≥80% blind
agreement with the owner). Business-Foundation never-post list = HARD fail.
Every critique is persisted to post_versions by the pipeline (drift monitoring).
"""

from typing import Any

from app.agents import context, llm
from app.config import get_settings
from app.schemas import Critique, Draft, PostFormat, Verdict

RUBRIC_AXES = (
    "hook", "brand_voice", "grammar_spelling", "language_rule",
    "factual", "cta", "hashtags",
)


def _system_prompt(language: str, settings_row: dict[str, Any]) -> str:
    lang_name = context.LANGUAGE_NAMES.get(language, language)
    allowlist = settings_row.get("english_allowlist") or []
    return (
        "You are a STRICT quality critic for ExamBro's Instagram content. You are the "
        "gate before a human sees the post — be demanding; a mediocre draft must fail.\n\n"
        "Score each axis 0–10 and give an overall score:\n"
        "- hook: does the first line stop the scroll?\n"
        f"- brand_voice: friendly mentor tone, fits ExamBro.\n"
        f"- grammar_spelling: {lang_name} grammar, spelling, natural phrasing — "
        "stilted or machine-translated phrasing fails.\n"
        f"- language_rule: {context.language_rule(language, allowlist)}\n"
        "- factual: exam facts (dates, rules, syllabus) must be plausible and not "
        "invented. Flag anything that smells hallucinated.\n"
        "- cta: clear, natural call to action.\n"
        "- hashtags: relevant, no spam, sensible count.\n\n"
        f"{context.never_post_block(settings_row)}\n"
        "If the draft violates ANY never-post rule: set never_post_violation=true, "
        "explain in violation_detail, and verdict MUST be needs_work regardless of "
        "scores.\n\n"
        f"{context.brand_voice_block()}\n\n"
        "VERDICT: 'good' only if the post could go live as-is (overall ≥ 8 and no axis "
        "below 6). Otherwise 'needs_work' with concrete, actionable "
        "revision_instructions the writer can follow."
    )


async def critique_draft(
    draft: Draft,
    topic: dict[str, Any],
    format_: PostFormat,
    language: str,
    settings_row: dict[str, Any],
) -> Critique:
    s = get_settings()
    user = (
        f"Topic: {topic['title']} — {topic.get('description') or ''}\n"
        f"Format: {format_.value}\n\n"
        f"CAPTION:\n{draft.caption}\n\n"
        f"HASHTAGS: {' '.join(draft.hashtags)}\n"
        + (f"\nREEL SCRIPT:\n{draft.script}\n" if draft.script else "")
        + "\nScore this draft against the rubric."
    )
    critique = await llm.complete_json(
        s.critic_provider, s.critic_model, _system_prompt(language, settings_row), user, Critique
    )
    # Hard-fail enforcement in code, not just the prompt
    if critique.never_post_violation:
        critique.verdict = Verdict.needs_work
    return critique


def passes(critique: Critique) -> bool:
    return critique.verdict == Verdict.good and not critique.never_post_violation
