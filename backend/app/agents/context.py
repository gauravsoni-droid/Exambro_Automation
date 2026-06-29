"""Shared prompt context — settings, pillars, examples pulled from DB and
rendered into prompt blocks. Language is ALWAYS a parameter (future English)."""

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.db import get_db
from app.schemas import AdaptiveContext, CompetitorDigest, ExamPhase, PerformanceDigest


def today_ist() -> datetime:
    """Current datetime in IST (Asia/Kolkata). Use once per pipeline entry and pass down."""
    return datetime.now(ZoneInfo("Asia/Kolkata"))


def current_context(now: datetime) -> str:
    """A prompt block that anchors every agent to today's real date and location rules."""
    date_str = f"{now.day} {now.strftime('%B %Y')}"
    return (
        f"Current date: {date_str} (IST)\n\n"
        "Treat this as today's date. Your training knowledge may be outdated.\n"
        "For anything time-sensitive (exam dates, notifications, registrations, "
        "latest news, trends), trust this date and live search instead of your "
        "internal memory.\n\n"
        "Never invent old years. "
        "Never say '2025' or '2024' unless the topic explicitly refers to those years.\n\n"
        "Target audience may live in a configured city. DO NOT mention the city "
        "in titles or captions unless the topic is specifically local (local counselling, "
        "local exam centre, district/state announcement, or city-specific admission dates). "
        "Otherwise keep content national."
    )

LANGUAGE_NAMES = {"hi": "Hindi (Devanagari script)", "en": "English"}


def language_rule(language: str, allowlist: list[str]) -> str:
    name = LANGUAGE_NAMES.get(language, language)
    return (
        f"LANGUAGE RULE (hard requirement): write in pure {name} only — one pure "
        "language per post. Keep English ONLY where it is genuinely better: exam names "
        "(JEE Mains, JEE Advanced, NEET, CUET, GUJCET), technical terms, hashtags, the "
        'brand name "ExamBro", and app links. '
        f"Keep-in-English allow-list: {', '.join(allowlist) if allowlist else '(none)'}."
    )


def load_settings_row() -> dict[str, Any]:
    rows = get_db().table("settings").select("*").limit(1).execute().data
    return rows[0] if rows else {}


def load_active_pillars() -> list[dict[str, Any]]:
    return (
        get_db()
        .table("pillars")
        .select("*")
        .eq("active", True)
        .order("sort_order")
        .execute()
        .data
    )


def load_golden_examples(limit: int = 6) -> list[dict[str, Any]]:
    return (
        get_db()
        .table("golden_examples")
        .select("caption,label,notes")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )


def load_brand_guidelines() -> list[dict[str, Any]]:
    return get_db().table("brand_guidelines").select("rule_type,content").execute().data


def business_foundation_block(settings_row: dict[str, Any]) -> str:
    """Brand identity block — used by Writer, Critic, and Image Maker to shape tone and visuals.

    bf_liked_topics is intentionally excluded: it is a topic-selection preference signal
    for the Topic Decider only. Use liked_topics_block() there instead.
    """
    parts = []
    if settings_row.get("bf_brand_name"):
        parts.append(f"Brand name: {settings_row['bf_brand_name']}")
    if settings_row.get("bf_who_we_serve"):
        parts.append(
            f"Who we serve: {settings_row['bf_who_we_serve']}"
            " — shape tone, examples and vocabulary around this audience"
        )
    if settings_row.get("bf_core_values"):
        parts.append(
            f"Core values: {settings_row['bf_core_values']}"
            " — apply these to every piece of content you write"
        )
    if not parts:
        return ""
    return (
        "BRAND IDENTITY (apply to writing style and tone — not a topic selector):\n"
        + "\n".join(f"- {p}" for p in parts)
    )


# ── ExamBro visual identity ────────────────────────────────────────────────────
# Source: /frontend/public/brand/logos/logo.svg  (primary colour reference)
#   "Exam" letters → #F58545 (orange, primary)
#   "Bro"  letters → #2B89CA (blue, secondary)
#   Cross-checked against /brand/logos/logoIcon.svg — palette confirmed.
#
# Logo compositing happens in image_maker._overlay_logo() — NOT by the AI.
# The AI must never draw, describe, or recreate the logo; it only keeps the
# bottom-left safe zone clear so the overlay has a clean landing spot.

_PALETTE: dict[str, str] = {
    "orange": "#F58545",  # primary  — headlines, key numbers, CTA highlights
    "blue":   "#2B89CA",  # secondary — backgrounds, structural panels, icon shapes
    "white":  "#FFFFFF",  # neutral   — body text, card surfaces
}

# Safe-zone dimensions the AI must honour so the post-processing overlay has room.
# Mirrored by the programmatic constants in image_maker._overlay_logo().
_LOGO_SAFE_ZONE = "left ≤12 % of image width × bottom ≤12 % of image height"


def brand_visuals_block() -> str:
    """Structured visual identity block injected into the Image Maker's planning LLM.

    The logo is composited programmatically after generation — the AI must not
    attempt to draw it. Only palette and safe-zone rules are passed here.
    """
    return "\n".join([
        "EXAMBRO VISUAL BRAND IDENTITY",
        "",
        "COLOUR PALETTE (stay within this palette — do not introduce clashing colours):",
        f"  Primary   ExamBro Orange {_PALETTE['orange']} — headlines, key numbers, CTA highlights, accents",
        f"  Secondary ExamBro Blue   {_PALETTE['blue']} — backgrounds, structural panels, icon shapes",
        f"  Neutral   White          {_PALETTE['white']} — body text, card surfaces",
        "  Rule: orange leads as the dominant accent; blue grounds the composition.",
        "",
        "LOGO — CRITICAL RULE:",
        "  DO NOT draw, describe, or recreate the ExamBro logo in your prompt.",
        "  The official logo is composited onto every image after generation.",
        f"  SAFE ZONE: keep {_LOGO_SAFE_ZONE} completely clear of",
        "  text, subjects, and key graphics so the overlay has a clean landing spot.",
    ])


# ── ──────────────────────────────────────────────────────────────────────────


def liked_topics_block(settings_row: dict[str, Any]) -> str:
    """Light topic-preference signal — Topic Decider only.

    Priority (highest to lowest):
    1. Owner Idea — always slot 1
    2. Breaking / urgent exam news — may break rotation
    3. Pillar rotation — determines which 3 pillars appear today
    4. These preferences — increase likelihood only, never override the above
    """
    liked = (settings_row.get("bf_liked_topics") or "").strip()
    if not liked:
        return ""
    return (
        "TOPIC PREFERENCES (preference signal only — does not override rotation):\n"
        f"- Lean towards: {liked}"
    )


def never_post_block(settings_row: dict[str, Any]) -> str:
    never = settings_row.get("bf_never_post") or []
    if not never:
        return ""
    return "NEVER POST (hard rules — any violation is an automatic fail):\n" + "\n".join(
        f"- {n}" for n in never
    )


def never_post_topics_block(settings_row: dict[str, Any]) -> str:
    """Never-post rules as a topic-generation filter — Topic Decider only.

    Prevents the LLM from suggesting topics that would inevitably require generating
    content that violates the owner's hard rules, avoiding wasted writer→critic loops.
    """
    never = settings_row.get("bf_never_post") or []
    if not never:
        return ""
    rules = "\n".join(f"- {n}" for n in never)
    return "NEVER POST (topic filter — skip topics that lead to forbidden content):\n" + rules


def target_audience_block(settings_row: dict[str, Any]) -> str:
    """All fields optional — system works if empty (PRD F4)."""
    parts = []
    for key, label in [
        ("ta_country", "Country"),
        ("ta_state", "State/region"),
        ("ta_city", "City"),
        ("ta_who", "Who they are"),
    ]:
        if settings_row.get(key):
            parts.append(f"{label}: {settings_row[key]}")
    if not parts:
        return ""
    return (
        "TARGET AUDIENCE (guide tone, examples, regional references — "
        "not an IG targeting control):\n" + "\n".join(f"- {p}" for p in parts)
    )


def brand_voice_block() -> str:
    rules = load_brand_guidelines()
    if not rules:
        return (
            "BRAND VOICE: ExamBro — friendly, helpful senior/mentor for JEE/NEET/CUET/GUJCET "
            "aspirants. Encouraging, practical, never preachy. CTA when natural: "
            '"Download ExamBro app — link in bio."'
        )
    lines = []
    for r in rules:
        prefix = {"voice": "Voice", "do": "Do", "dont": "Don't"}.get(r["rule_type"], r["rule_type"])
        lines.append(f"- [{prefix}] {r['content']}")
    return "BRAND VOICE RULES:\n" + "\n".join(lines)


def few_shot_block() -> str:
    examples = load_golden_examples()
    if not examples:
        return ""
    lines = ["EXAMPLES FROM REAL EXAMBRO POSTS (match the good, avoid the bad):"]
    for e in examples:
        tag = "GOOD" if e["label"] == "good" else "BAD"
        note = f" — {e['notes']}" if e.get("notes") else ""
        lines.append(f"[{tag}]{note}\n{e['caption']}\n")
    return "\n".join(lines)


def content_language() -> str:
    rows = get_db().table("settings").select("content_language").limit(1).execute().data
    if rows and rows[0].get("content_language"):
        return rows[0]["content_language"]
    return get_settings().content_language


# Pillar name → preferred-during-phase mapping.
# Keys match ExamPhase values; pillar names match DB seeds in 0001_initial_schema.sql.
_PHASE_PILLAR_HINTS: dict[str, dict[str, list[str] | str]] = {
    ExamPhase.off_season: {
        "prefer": ["Study tips & strategy", "PYQ / concept"],
        "note": "Off season — build foundations. Focus on concept mastery and study strategy.",
    },
    ExamPhase.registration: {
        "prefer": ["Exam news & updates", "Study tips & strategy"],
        "note": "Registration open — application guidance and early-prep tips are top priority.",
    },
    ExamPhase.preparation: {
        "prefer": ["Study tips & strategy", "PYQ / concept"],
        "note": "Active preparation — subject mastery and structured practice dominate.",
    },
    ExamPhase.revision: {
        "prefer": ["PYQ / concept", "Study tips & strategy", "Motivation"],
        "note": "Revision phase — PYQ drills, mistake analysis, and exam-day confidence.",
    },
    ExamPhase.exam_week: {
        "prefer": ["Exam news & updates", "Study tips & strategy"],
        "note": "Exam week — last-minute tips, logistics, breaking news, calm confidence.",
    },
    ExamPhase.results: {
        "prefer": ["Exam news & updates", "Motivation"],
        "note": "Results out — outcome analysis, next-step guidance, and encouragement.",
    },
    ExamPhase.counselling: {
        "prefer": ["Exam news & updates"],
        "note": "Counselling phase — college options, cutoffs, and admission guidance.",
    },
}


def adaptive_strategy_block(ctx: AdaptiveContext) -> str:
    """Exam-calendar-driven pillar weighting block for Topic Decider.

    Called only when adaptive_strategy_enabled = True (caller guarantees ctx is not None).
    Always returns a non-empty string (off_season still has actionable pillar hints).

    Injection order in the prompt: before performance_block, after never_post/liked_topics.
    """
    hints = _PHASE_PILLAR_HINTS.get(ctx.phase, {})
    prefer: list[str] = hints.get("prefer", [])  # type: ignore[assignment]
    note: str = hints.get("note", "")  # type: ignore[assignment]

    phase_label = ctx.phase.value.replace("_", " ").title()

    if ctx.days_to_exam is not None:
        ref = f"{ctx.nearest_exam_name} in {ctx.days_to_exam} day{'s' if ctx.days_to_exam != 1 else ''}"
    elif ctx.days_since_exam is not None:
        ref = f"{ctx.nearest_exam_name} {ctx.days_since_exam} day{'s' if ctx.days_since_exam != 1 else ''} ago"
    elif ctx.nearest_exam_name:
        ref = ctx.nearest_exam_name
    else:
        ref = "no specific exam in window"

    lines = [
        f"ADAPTIVE STRATEGY — exam phase: {phase_label} ({ref})",
        note,
    ]

    if prefer:
        lines.append(
            "Preferred pillars today (apply to slots 2–3; slot 1 is reserved for owner ideas):"
        )
        for p in prefer:
            lines.append(f"  - {p}")

    return "\n".join(lines)


def performance_block(digest: PerformanceDigest) -> str:
    """Performance learning block for Topic Decider.

    Returns empty string when:
    - total_posts_analyzed < MIN_TOTAL_POSTS (imported threshold is 5)
    - digest has no actionable signal (no strong/weak pillars, no topic patterns)

    Ordering in the prompt: before competitor_trends_block, after never_post/liked_topics.
    """
    if digest.total_posts_analyzed < 5:
        return ""

    has_signal = (
        digest.strong_pillars
        or digest.weak_pillars
        or digest.high_performing_topics
        or digest.weak_topics
        or digest.preferred_format
    )
    if not has_signal:
        return ""

    lines = ["PERFORMANCE SIGNAL (preference only — does not override rotation or rules):"]

    if digest.strong_pillars:
        lines.append(
            "Strong pillars (lean into for slots 2–3): "
            + ", ".join(digest.strong_pillars)
        )

    if digest.weak_pillars:
        lines.append(
            "Weak pillars (try fresh angles or lighter coverage): "
            + ", ".join(digest.weak_pillars)
        )

    if digest.high_performing_topics:
        lines.append("Top topics (style reference — do not repeat):")
        for t in digest.high_performing_topics:
            lines.append(f"  - {t}")

    if digest.weak_topics:
        lines.append("Recently rejected topics (avoid similar angles):")
        for t in digest.weak_topics:
            lines.append(f"  - {t}")

    if digest.preferred_format:
        lines.append(
            f"Owner tends to approve {digest.preferred_format} posts — "
            "favour this format when suggesting topics."
        )

    lines.append(f"(Signal from {digest.total_posts_analyzed} posts)")

    return "\n".join(lines)


def competitor_trends_block(digest: CompetitorDigest) -> str:
    """Competitor intelligence block for Topic Decider. Empty string when no data.

    Priority rules baked into the block text:
    - Prefer content gaps (differentiation) over trending themes (following the crowd).
    - Never copy competitor posts or phrasing — themes are inspiration only.
    - Overused topics should be avoided regardless of pillar rotation.
    """
    has_data = (
        digest.trending_themes or digest.content_gaps or digest.overused_topics
    )
    if not has_data:
        return ""

    lines = [
        "COMPETITOR INTELLIGENCE (inspiration only — NEVER copy competitor posts or phrasing):"
    ]

    if digest.content_gaps:
        lines.append("Content gaps — ExamBro can own these (prefer for slots 2–3):")
        for gap in digest.content_gaps:
            lines.append(f"  - {gap}")

    if digest.trending_themes:
        lines.append(
            "Trending (match only if it fits rotation and adds genuine value):"
        )
        for t in digest.trending_themes:
            suffix = f" ({t.handle_count} accounts)" if t.handle_count > 1 else ""
            lines.append(f"  - {t.theme}{suffix}")

    if digest.overused_topics:
        lines.append("Oversaturated (avoid):")
        for o in digest.overused_topics:
            lines.append(f"  - {o}")

    lines.append("Priority: gaps > trending > no signal. Competitor data shapes slots 2–3 only.")

    return "\n".join(lines)
