"""Shared prompt context — settings, pillars, examples pulled from DB and
rendered into prompt blocks. Language is ALWAYS a parameter (future English)."""

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.db import get_db


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
    parts = []
    if settings_row.get("bf_brand_name"):
        parts.append(f"Brand name: {settings_row['bf_brand_name']}")
    if settings_row.get("bf_who_we_serve"):
        parts.append(f"Who we serve: {settings_row['bf_who_we_serve']}")
    if settings_row.get("bf_core_values"):
        parts.append(f"Core values: {settings_row['bf_core_values']}")
    if settings_row.get("bf_liked_topics"):
        parts.append(f"Topics we like: {settings_row['bf_liked_topics']}")
    if not parts:
        return ""
    return "BUSINESS FOUNDATION:\n" + "\n".join(f"- {p}" for p in parts)


def never_post_block(settings_row: dict[str, Any]) -> str:
    never = settings_row.get("bf_never_post") or []
    if not never:
        return ""
    return "NEVER POST (hard rules — any violation is an automatic fail):\n" + "\n".join(
        f"- {n}" for n in never
    )


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
