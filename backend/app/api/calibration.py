"""Phase-0 Critic Accuracy Test — throwaway review screen API (Appflow §5).

Blind protocol: the owner's verdict is saved FIRST; the critic's verdict is
revealed only in the response to that save. Pass gate: ≥80% agreement (40/50).
This module retires after Phase 0; critic scores keep flowing to post_versions.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.agents import context, critic
from app.api.deps import require_owner
from app.db import get_db
from app.schemas import (
    CalibrationItemOut,
    CalibrationLabelIn,
    CalibrationSummary,
    Draft,
    PostFormat,
)

router = APIRouter(
    prefix="/calibration", tags=["calibration"], dependencies=[Depends(require_owner)]
)


class SeedIn(BaseModel):
    contents: list[str]


@router.post("/seed")
def seed(body: SeedIn) -> dict:
    """Load the 50 sample posts (real past posts + AI drafts, good + weak mix)."""
    rows = [{"content": c} for c in body.contents]
    get_db().table("calibration_items").insert(rows).execute()
    return {"inserted": len(rows)}


@router.get("/next", response_model=CalibrationItemOut | None)
def next_item() -> CalibrationItemOut | None:
    """Next unlabeled item — critic fields stripped (blind)."""
    rows = (
        get_db()
        .table("calibration_items")
        .select("id,content")
        .is_("owner_verdict", "null")
        .order("created_at")
        .limit(1)
        .execute()
        .data
    )
    return CalibrationItemOut(**rows[0]) if rows else None


@router.post("/{item_id}/label", response_model=CalibrationItemOut)
async def label(item_id: str, body: CalibrationLabelIn) -> CalibrationItemOut:
    """Save the owner's blind verdict, then run + reveal the critic's."""
    db = get_db()
    rows = db.table("calibration_items").select("*").eq("id", item_id).execute().data
    if not rows:
        raise HTTPException(404, "Item not found")
    item = rows[0]
    if item["owner_verdict"] is not None:
        raise HTTPException(409, "Already labeled")

    # Owner verdict saved FIRST — the blind protocol
    db.table("calibration_items").update(
        {"owner_verdict": body.verdict.value, "owner_labeled_at": "now()"}
    ).eq("id", item_id).execute()

    if item["critic_verdict"] is None:
        settings_row = context.load_settings_row()
        crit = await critic.critique_draft(
            Draft(caption=item["content"], hashtags=[]),
            {"title": "Calibration sample", "description": ""},
            PostFormat.post,
            context.content_language(),
            settings_row,
        )
        db.table("calibration_items").update(
            {"critic_verdict": crit.verdict.value, "critic_score": crit.overall_score}
        ).eq("id", item_id).execute()

    final = db.table("calibration_items").select("*").eq("id", item_id).execute().data[0]
    return CalibrationItemOut(**final)


@router.post("/rerun-critic", response_model=CalibrationSummary)
async def rerun_critic() -> CalibrationSummary:
    """Retest after a rubric change: re-run the critic on all owner-labeled items.

    Owner verdicts stay (they were blind at label time — still the answer key);
    only the critic's side is recomputed.
    """
    db = get_db()
    items = (
        db.table("calibration_items")
        .select("id,content")
        .not_.is_("owner_verdict", "null")
        .execute()
        .data
    )
    settings_row = context.load_settings_row()
    for item in items:
        crit = await critic.critique_draft(
            Draft(caption=item["content"], hashtags=[]),
            {"title": "Calibration sample", "description": ""},
            PostFormat.post,
            context.content_language(),
            settings_row,
        )
        db.table("calibration_items").update(
            {"critic_verdict": crit.verdict.value, "critic_score": crit.overall_score}
        ).eq("id", item["id"]).execute()
    return summary()


@router.get("/summary", response_model=CalibrationSummary)
def summary() -> CalibrationSummary:
    rows = get_db().table("calibration_items").select("agreed").execute().data
    labeled = [r for r in rows if r["agreed"] is not None]
    agreed = sum(1 for r in labeled if r["agreed"])
    return CalibrationSummary(
        total=len(rows),
        labeled=len(labeled),
        agreed=agreed,
        pass_gate=len(labeled) >= 50 and agreed >= 40,
    )
