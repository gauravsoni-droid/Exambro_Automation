"""Tap-1 endpoints — Today screen."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_owner
from app.db import get_db
from app.pipeline import orchestrator
from app.schemas import TopicOut

router = APIRouter(prefix="/topics", tags=["topics"], dependencies=[Depends(require_owner)])


def _to_out(row: dict) -> TopicOut:
    pillar = row.get("pillars") or {}
    return TopicOut(**{**row, "pillar_name": pillar.get("name")})


@router.post("/run-round")
async def run_round() -> dict:
    """Manual topic round from the dashboard (testing / scheduler-off mode).

    Same guards as the scheduled run — idempotent, one-in-flight, cadence.
    Synchronous on purpose so the caller sees the result or skip reason.
    """
    try:
        return await orchestrator.run_topic_round()
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/today", response_model=list[TopicOut])
def today_topics() -> list[TopicOut]:
    """Latest round's suggested topics (missed-day safe: whatever round is waiting)."""
    db = get_db()
    latest = (
        db.table("topics")
        .select("round_date")
        .eq("status", "suggested")
        .order("round_date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not latest:
        return []
    rows = (
        db.table("topics")
        .select("*, pillars(name)")
        .eq("round_date", latest[0]["round_date"])
        .eq("status", "suggested")
        .order("slot")
        .execute()
        .data
    )
    return [_to_out(r) for r in rows]


@router.post("/{topic_id}/pick")
def pick(topic_id: str) -> dict:
    """Tap 1 — pick 1 of 3. Generation starts in the background."""
    try:
        post = orchestrator.pick_topic(topic_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    orchestrator.spawn_generation(post["id"])
    return {"post_id": post["id"], "status": post["status"]}


@router.post("/reject-all")
async def reject_all(round_date: date) -> dict:
    """Tap 1 — reject all 3 → 3 fresh suggestions."""
    try:
        return await orchestrator.reject_all_topics(round_date)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
