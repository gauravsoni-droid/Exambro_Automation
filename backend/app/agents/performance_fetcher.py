"""Performance Learning — aggregates owner feedback into a signal for the Topic Decider.

Data sources (in priority order):
1. metrics table: saves + shares per post (Phase 2 — populated by future daily ingestion job).
2. approvals table: owner tap1_pick rate per pillar + tap2 outcomes (Phase 1 — always available).
3. posts table: critic_score, format, status.

Rules:
- Minimum MIN_PILLAR_SAMPLE suggested topics required before a pillar is labelled strong/weak.
- Minimum MIN_TOTAL_POSTS total posts required before any signal is surfaced.
- No LLM calls — pure DB aggregation, fast and cheap.
- Failure-tolerant: always returns an empty PerformanceDigest on any error.
"""

import logging
from collections import defaultdict
from datetime import datetime
from typing import Any

from app.db import get_db
from app.schemas import PerformanceDigest

logger = logging.getLogger(__name__)

MIN_PILLAR_SAMPLE = 5   # min suggested topics per pillar to compute pick rate
MIN_TOTAL_POSTS = 5     # min total analysed posts before any signal is returned
MAX_TOPIC_EXAMPLES = 5  # recent topic titles surfaced per category


def _pick_rates(
    topics: list[dict[str, Any]],
    pillar_map: dict[str, str],
) -> dict[str, dict[str, Any]]:
    """Per-pillar: count suggested + picked topics, compute pick rate."""
    stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"name": "", "suggested": 0, "picked": 0}
    )
    for t in topics:
        pid = t.get("pillar_id")
        if not pid or pid not in pillar_map:
            continue
        stats[pid]["name"] = pillar_map[pid]
        stats[pid]["suggested"] += 1
        if t.get("status") == "picked":
            stats[pid]["picked"] += 1
    return stats


def _format_preference(posts: list[dict[str, Any]]) -> str | None:
    """Return "post" or "reel" if one format has ≥ 70% of approved posts."""
    counts: dict[str, int] = defaultdict(int)
    for p in posts:
        if p.get("status") == "saved" and p.get("format"):
            counts[p["format"]] += 1
    total = sum(counts.values())
    if total < MIN_PILLAR_SAMPLE:
        return None
    for fmt, n in counts.items():
        if n / total >= 0.70:
            return fmt
    return None


def _engagement_score(
    post_id: str, metrics_by_post: dict[str, dict[str, Any]]
) -> float | None:
    """Return saves+shares for a post if Phase-2 metrics are available."""
    m = metrics_by_post.get(post_id)
    if not m:
        return None
    saves = m.get("saves") or 0
    shares = m.get("shares") or 0
    return float(saves + shares)


async def fetch_performance_signal(
    settings_row: dict[str, Any], now: datetime
) -> PerformanceDigest:
    """Aggregate performance signal from DB. Returns empty digest on any failure.

    Called from orchestrator.run_topic_round() in parallel with news and competitor
    fetches via asyncio.gather — no awaits inside, runs synchronously.
    """
    try:
        db = get_db()

        # ── Load raw data ────────────────────────────────────────────────────
        topics: list[dict] = (
            db.table("topics")
            .select("id,pillar_id,status,title,round_date")
            .execute()
            .data
        )
        posts: list[dict] = (
            db.table("posts")
            .select("id,topic_id,format,critic_score,status")
            .execute()
            .data
        )
        approvals: list[dict] = (
            db.table("approvals")
            .select("post_id,action")
            .execute()
            .data
        )
        pillars: list[dict] = (
            db.table("pillars")
            .select("id,name")
            .execute()
            .data
        )

        # Phase-2 metrics — empty until daily ingestion job runs (safe to query now)
        try:
            metrics_rows: list[dict] = (
                db.table("metrics")
                .select("post_id,likes,saves,shares,reach")
                .execute()
                .data
            )
        except Exception as exc:
            logger.debug("metrics table not yet available: %s", exc)
            metrics_rows = []

        if not posts and not topics:
            return PerformanceDigest()

        # ── Build lookup maps ────────────────────────────────────────────────
        pillar_map: dict[str, str] = {p["id"]: p["name"] for p in pillars}
        topic_by_id: dict[str, dict] = {t["id"]: t for t in topics}
        metrics_by_post: dict[str, dict] = {
            m["post_id"]: m for m in metrics_rows if m.get("post_id")
        }

        # post_id → list of approval actions
        post_actions: dict[str, list[str]] = defaultdict(list)
        for a in approvals:
            if a.get("post_id"):
                post_actions[a["post_id"]].append(a["action"])

        # ── Per-pillar pick rates ────────────────────────────────────────────
        pillar_stats = _pick_rates(topics, pillar_map)

        strong_pillars: list[str] = []
        weak_pillars: list[str] = []
        for pid, stats in pillar_stats.items():
            if stats["suggested"] < MIN_PILLAR_SAMPLE:
                continue
            rate = stats["picked"] / stats["suggested"]
            if rate >= 0.65:
                strong_pillars.append(stats["name"])
            elif rate <= 0.25:
                weak_pillars.append(stats["name"])

        # ── Per-post performance: high-performing vs weak ────────────────────
        # Canonical signals (highest to lowest reliability):
        # 1. Phase-2: high engagement (saves+shares) from metrics table
        # 2. Phase-1: approved post with NO tweak (owner happy on first view)
        # 3. Phase-1 weak: rejected at tap2
        high_scored: list[tuple[str, str]] = []   # (round_date, title) — Phase 2
        approved_clean: list[tuple[str, str]] = [] # (round_date, title) — Phase 1
        rejected: list[tuple[str, str]] = []       # (round_date, title)

        terminal_statuses = {"saved", "rejected"}
        analyzed = 0

        for p in posts:
            if p.get("status") not in terminal_statuses and p.get("status") != "awaiting_approval":
                continue
            analyzed += 1

            topic = topic_by_id.get(p.get("topic_id") or "")
            if not topic or not topic.get("title"):
                continue

            title = topic["title"]
            date_str = topic.get("round_date") or ""
            actions = post_actions.get(p["id"], [])

            # Phase-2 engagement signal
            eng = _engagement_score(p["id"], metrics_by_post)
            if eng is not None and eng > 0:
                high_scored.append((date_str, title))

            # Phase-1 owner approval signals
            if p.get("status") == "saved" and "tap2_tweak" not in actions:
                approved_clean.append((date_str, title))

            if "tap2_reject" in actions:
                rejected.append((date_str, title))

        # Prefer Phase-2 engagement data; fall back to Phase-1 approval patterns
        high_source = high_scored if high_scored else approved_clean
        high_source.sort(key=lambda x: x[0], reverse=True)
        rejected.sort(key=lambda x: x[0], reverse=True)

        high_titles = [t for _, t in high_source[:MAX_TOPIC_EXAMPLES]]
        weak_titles = [t for _, t in rejected[:MAX_TOPIC_EXAMPLES]]

        # ── Format preference ────────────────────────────────────────────────
        preferred_format = _format_preference(posts)

        return PerformanceDigest(
            strong_pillars=strong_pillars,
            weak_pillars=weak_pillars,
            high_performing_topics=high_titles,
            weak_topics=weak_titles,
            preferred_format=preferred_format,
            total_posts_analyzed=analyzed,
        )

    except Exception as exc:
        logger.error("Performance signal failed, skipping: %s", exc)
        return PerformanceDigest()
