"""Idea box — text / image / link drops; pending idea fills slot 1 next round."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_owner
from app.db import get_db
from app.schemas import IdeaIn, IdeaOut

router = APIRouter(prefix="/ideas", tags=["ideas"], dependencies=[Depends(require_owner)])


@router.get("", response_model=list[IdeaOut])
def list_ideas() -> list[IdeaOut]:
    rows = get_db().table("ideas").select("*").order("created_at", desc=True).execute().data
    return [IdeaOut(**r) for r in rows]


@router.post("", response_model=IdeaOut)
def add_idea(body: IdeaIn) -> IdeaOut:
    row = get_db().table("ideas").insert(body.model_dump(mode="json")).execute().data[0]
    return IdeaOut(**row)


@router.delete("/{idea_id}")
def discard_idea(idea_id: str) -> dict:
    rows = (
        get_db()
        .table("ideas")
        .update({"status": "discarded"})
        .eq("id", idea_id)
        .eq("status", "pending")
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "Pending idea not found")
    return {"status": "discarded"}
