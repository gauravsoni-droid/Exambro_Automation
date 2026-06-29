"""Exam Calendar & Adaptive Strategy — determines current exam phase for topic weighting.

Flow:
1. If adaptive_strategy_enabled = False → return None immediately (caller skips the block).
2. Query exam_calendar DB table for events in a ±90/180-day window.
3. If the table is empty or missing, use Claude web search to find current exam dates,
   then cache the results back into the table for subsequent same-day calls.
4. Detect the current phase using rule-based proximity logic (D14 — no ML).
5. Return AdaptiveContext with phase + reference exam context.

Phase detection rules (days relative to nearest exam):
  exam_week:   0–7  days before
  revision:    8–30 days before
  preparation: 31–60 days before
  registration: 61–90 days before  (registration windows typically open ~2 months out)
  off_season:  > 90 days before (or no upcoming exam data)
  results:     0–30 days after
  counselling: 31–90 days after

Failure-tolerant: always returns AdaptiveContext(phase=off_season) on any error.
"""

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any

from app.agents import context, llm
from app.db import get_db
from app.schemas import AdaptiveContext, ExamEvent, ExamPhase

logger = logging.getLogger(__name__)

_WEB_SEARCH_SYSTEM = (
    "You are a researcher tracking Indian competitive examination schedules. "
    "Search for the official exam dates of upcoming and recently completed Indian "
    "entrance exams. Return only confirmed dates from official sources "
    "(nta.ac.in, jeemain.nta.nic.in, neet.nta.nic.in, gseb.org).\n\n"
    "Exams to cover: JEE Mains Session 1, JEE Mains Session 2, JEE Advanced, "
    "NEET UG, CUET UG, GUJCET.\n\n"
    "Include events from the last 90 days and next 180 days relative to today's date.\n\n"
    "Respond with ONLY this JSON (no prose):\n"
    '{"events": [{"exam_name": "JEE Mains Session 1", "exam_date": "YYYY-MM-DD"}, ...]}'
)


def _load_from_db(today: date) -> list[ExamEvent]:
    """Load exam events from the exam_calendar table. Returns [] if table missing."""
    try:
        since = (today - timedelta(days=90)).isoformat()
        until = (today + timedelta(days=180)).isoformat()
        rows = (
            get_db()
            .table("exam_calendar")
            .select("exam_name,exam_date")
            .gte("exam_date", since)
            .lte("exam_date", until)
            .order("exam_date")
            .execute()
            .data
        )
        return [
            ExamEvent(
                exam_name=r["exam_name"],
                exam_date=date.fromisoformat(r["exam_date"]),
            )
            for r in rows
            if r.get("exam_name") and r.get("exam_date")
        ]
    except Exception as exc:
        logger.debug("exam_calendar table unavailable: %s", exc)
        return []


def _seed_db(events: list[ExamEvent]) -> None:
    """Cache web-fetched events to exam_calendar. Silent no-op if table doesn't exist."""
    if not events:
        return
    try:
        rows = [
            {"exam_name": e.exam_name, "exam_date": e.exam_date.isoformat()}
            for e in events
        ]
        get_db().table("exam_calendar").upsert(
            rows, on_conflict="exam_name,exam_date"
        ).execute()
        logger.info("Seeded %d exam dates into exam_calendar", len(rows))
    except Exception as exc:
        logger.debug("exam_calendar seed skipped (table may not exist yet): %s", exc)


def _short_exam_name(raw: str) -> str:
    """Normalise a raw exam name to a brief, UI-ready token."""
    r = raw.lower()
    if "jee advanced" in r:
        return "JEE Advanced"
    if "jee main" in r:
        return "JEE Mains"
    if "neet" in r:
        return "NEET"
    if "cuet" in r:
        return "CUET"
    if "gujcet" in r:
        return "GUJCET"
    return raw


_PHASE_DISPLAY: dict[ExamPhase, str | None] = {
    ExamPhase.exam_week:    "Exam Week",
    ExamPhase.revision:     "Revision",
    ExamPhase.preparation:  "Prep",
    ExamPhase.registration: "Registration",
    ExamPhase.results:      "Results",
    ExamPhase.counselling:  "Counselling",
    ExamPhase.off_season:   None,
}

# Phases worth surfacing as a label in the UI (not just silent prep/registration)
_PROMINENT_PHASES = {
    ExamPhase.exam_week,
    ExamPhase.revision,
    ExamPhase.results,
    ExamPhase.counselling,
}


def _build_current_focus(today: date, events: list[ExamEvent]) -> str | None:
    """Build a UI-ready 'current_focus' string from all active exam events.

    Covers all ExamBro exams — JEE, NEET, CUET, GUJCET.
    Returns None when no exams are in season.
    """
    seen: set[str] = set()
    active: list[tuple[str, ExamPhase]] = []  # (short_name, phase)

    for ev in sorted(
        [e for e in events if e.exam_date >= today], key=lambda e: e.exam_date
    ):
        days = (ev.exam_date - today).days
        if days <= 7:
            phase = ExamPhase.exam_week
        elif days <= 30:
            phase = ExamPhase.revision
        elif days <= 60:
            phase = ExamPhase.preparation
        elif days <= 90:
            phase = ExamPhase.registration
        else:
            continue
        name = _short_exam_name(ev.exam_name)
        if name not in seen:
            seen.add(name)
            active.append((name, phase))

    for ev in sorted(
        [e for e in events if e.exam_date < today],
        key=lambda e: e.exam_date,
        reverse=True,
    ):
        days_since = (today - ev.exam_date).days
        if days_since <= 30:
            phase = ExamPhase.results
        elif days_since <= 90:
            phase = ExamPhase.counselling
        else:
            break
        name = _short_exam_name(ev.exam_name)
        if name not in seen:
            seen.add(name)
            active.append((name, phase))

    if not active:
        return None

    phase_set = {p for _, p in active}

    if len(phase_set) == 1:
        phase = next(iter(phase_set))
        names = " • ".join(n for n, _ in active)
        label = _PHASE_DISPLAY.get(phase)
        if label and phase in _PROMINENT_PHASES:
            return f"{names} {label}"
        return names  # prep / registration: just list the exams

    # Multiple phases → per-exam labels: "NEET Results • JEE Counselling"
    parts: list[str] = []
    for name, phase in active:
        label = _PHASE_DISPLAY.get(phase)
        parts.append(f"{name} {label}" if label else name)
    return " • ".join(parts)


def get_current_focus(today: date) -> str | None:
    """DB-only (no LLM). Called by the settings API to display the exam season."""
    return _build_current_focus(today, _load_from_db(today))


def _detect_phase(
    today: date, events: list[ExamEvent]
) -> tuple[ExamPhase, ExamEvent | None]:
    """Rule-based phase detection. No ML. Returns (phase, reference_event)."""
    upcoming = sorted(
        [e for e in events if e.exam_date >= today], key=lambda e: e.exam_date
    )
    past = sorted(
        [e for e in events if e.exam_date < today],
        key=lambda e: e.exam_date,
        reverse=True,
    )

    # Upcoming exam is the primary signal
    if upcoming:
        nearest = upcoming[0]
        days = (nearest.exam_date - today).days
        if days <= 7:
            return ExamPhase.exam_week, nearest
        if days <= 30:
            return ExamPhase.revision, nearest
        if days <= 60:
            return ExamPhase.preparation, nearest
        if days <= 90:
            return ExamPhase.registration, nearest

    # Past exam determines results / counselling window
    if past:
        recent = past[0]
        days_since = (today - recent.exam_date).days
        if days_since <= 30:
            return ExamPhase.results, recent
        if days_since <= 90:
            return ExamPhase.counselling, recent

    return ExamPhase.off_season, None


async def fetch_adaptive_context(
    settings_row: dict[str, Any], now: datetime
) -> AdaptiveContext | None:
    """Fetch exam calendar and determine the current phase.

    Returns:
        None  — when adaptive_strategy_enabled = False (caller omits the block entirely)
        AdaptiveContext — current phase with optional exam reference; never raises
    """
    if not settings_row.get("adaptive_strategy_enabled", True):
        logger.debug("Adaptive strategy disabled — skipping calendar fetch")
        return None

    today = now.date()

    try:
        # 1. DB first (fast, no LLM cost)
        events = _load_from_db(today)

        # 2. Web search fallback — runs when table is missing or empty
        if not events:
            logger.info("exam_calendar empty — fetching dates via web search")
            system = context.current_context(now) + "\n\n" + _WEB_SEARCH_SYSTEM
            month_year = now.strftime("%B %Y")
            user = (
                f"Find official exam dates for Indian entrance exams around {month_year}. "
                "Focus on JEE Mains, JEE Advanced, NEET UG, CUET UG, and GUJCET. "
                "Include dates from the last 90 days and the next 180 days."
            )
            raw = await llm.claude_web_search(system, user)
            data = llm._extract_json(raw)
            raw_events = data.get("events") or []
            events = []
            for item in raw_events:
                try:
                    events.append(
                        ExamEvent(
                            exam_name=item["exam_name"],
                            exam_date=date.fromisoformat(str(item["exam_date"])),
                        )
                    )
                except (KeyError, ValueError, TypeError):
                    continue
            _seed_db(events)  # cache for the day

        if not events:
            logger.info("No exam date data available — defaulting to off_season")
            return AdaptiveContext(phase=ExamPhase.off_season)

        phase, ref = _detect_phase(today, events)
        current_focus = _build_current_focus(today, events)

        if ref is None:
            return AdaptiveContext(phase=phase, current_focus=current_focus)

        if ref.exam_date >= today:
            return AdaptiveContext(
                phase=phase,
                nearest_exam_name=ref.exam_name,
                days_to_exam=(ref.exam_date - today).days,
                current_focus=current_focus,
            )

        return AdaptiveContext(
            phase=phase,
            nearest_exam_name=ref.exam_name,
            days_since_exam=(today - ref.exam_date).days,
            current_focus=current_focus,
        )

    except Exception as exc:
        logger.error("Exam calendar fetch failed, defaulting to off_season: %s", exc)
        return AdaptiveContext(phase=ExamPhase.off_season)
