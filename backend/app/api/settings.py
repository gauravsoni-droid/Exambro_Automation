"""Settings — cadence, Business Foundation, Target Audience, allow-list, handles; pillars CRUD."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_owner
from app.db import get_db
from app.schemas import PillarIn, PillarOut, SettingsIn, SettingsOut

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(require_owner)])
pillars_router = APIRouter(
    prefix="/pillars", tags=["pillars"], dependencies=[Depends(require_owner)]
)


@router.get("", response_model=SettingsOut)
def get_settings_row() -> SettingsOut:
    rows = get_db().table("settings").select("*").limit(1).execute().data
    if not rows:
        raise HTTPException(500, "Settings row missing — run the seed migration")
    return SettingsOut(**rows[0])


@router.patch("", response_model=SettingsOut)
def update_settings(body: SettingsIn) -> SettingsOut:
    db = get_db()
    current = db.table("settings").select("id").limit(1).execute().data
    if not current:
        raise HTTPException(500, "Settings row missing — run the seed migration")
    changes = body.model_dump(mode="json", exclude_none=True)
    if not changes:
        raise HTTPException(400, "Nothing to update")
    changes["updated_at"] = "now()"
    row = db.table("settings").update(changes).eq("id", current[0]["id"]).execute().data[0]
    return SettingsOut(**row)


@pillars_router.get("", response_model=list[PillarOut])
def list_pillars() -> list[PillarOut]:
    rows = get_db().table("pillars").select("*").order("sort_order").execute().data
    return [PillarOut(**r) for r in rows]


@pillars_router.post("", response_model=PillarOut)
def add_pillar(body: PillarIn) -> PillarOut:
    row = get_db().table("pillars").insert(body.model_dump(mode="json")).execute().data[0]
    return PillarOut(**row)


@pillars_router.patch("/{pillar_id}", response_model=PillarOut)
def update_pillar(pillar_id: str, body: PillarIn) -> PillarOut:
    rows = (
        get_db()
        .table("pillars")
        .update(body.model_dump(mode="json"))
        .eq("id", pillar_id)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "Pillar not found")
    return PillarOut(**rows[0])


@pillars_router.delete("/{pillar_id}")
def delete_pillar(pillar_id: str) -> dict:
    """Hard delete only if unreferenced; otherwise the owner should disable it."""
    db = get_db()
    used = db.table("topics").select("id").eq("pillar_id", pillar_id).limit(1).execute().data
    if used:
        raise HTTPException(409, "Pillar has topics — disable it instead of deleting")
    rows = db.table("pillars").delete().eq("id", pillar_id).execute().data
    if not rows:
        raise HTTPException(404, "Pillar not found")
    return {"status": "deleted"}
