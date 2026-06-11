"""Queue / History — past + saved posts, edit-rate metric, pillar balance."""

from collections import Counter

from fastapi import APIRouter, Depends

from app.api.deps import require_owner
from app.db import get_db

router = APIRouter(prefix="/queue", tags=["queue"], dependencies=[Depends(require_owner)])


@router.get("")
def history(limit: int = 50) -> list[dict]:
    """Posts joined with their topic + pillar, newest first."""
    return (
        get_db()
        .table("posts")
        .select("*, topics(title, round_date, pillar_id, pillars(name))")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )


@router.get("/stats")
def stats() -> dict:
    """Edit rate (tweaks ÷ Tap-2 totals → the 90% bar) + pillar balance over time."""
    db = get_db()
    approvals = db.table("approvals").select("action").execute().data
    counts = Counter(a["action"] for a in approvals)
    tap2_total = counts["tap2_approve"] + counts["tap2_tweak"] + counts["tap2_reject"]
    edit_rate = (counts["tap2_tweak"] / tap2_total) if tap2_total else 0.0
    approve_no_edit_rate = (counts["tap2_approve"] / tap2_total) if tap2_total else 0.0

    picked = (
        db.table("topics")
        .select("pillar_id, pillars(name)")
        .eq("status", "picked")
        .execute()
        .data
    )
    balance = Counter((t.get("pillars") or {}).get("name") or "?" for t in picked)

    return {
        "tap2_total": tap2_total,
        "approved_without_edits": counts["tap2_approve"],
        "tweaks": counts["tap2_tweak"],
        "rejects": counts["tap2_reject"],
        "edit_rate": round(edit_rate, 3),
        "approve_no_edit_rate": round(approve_no_edit_rate, 3),
        "pillar_balance": dict(balance),
    }
