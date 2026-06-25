"""Tap-2 endpoints — Post review screen."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import require_owner
from app.db import get_db
from app.pipeline import orchestrator
from app.schemas import PostOut, TweakIn


class PostPatchIn(BaseModel):
    caption: str | None = None
    hashtags: list[str] | None = None

router = APIRouter(prefix="/posts", tags=["posts"], dependencies=[Depends(require_owner)])

IN_FLIGHT = ["topic_chosen", "generating", "content_ready", "awaiting_approval"]


@router.get("/current", response_model=PostOut | None)
def current_post() -> PostOut | None:
    """The single in-flight post, if any (strictly one at a time)."""
    rows = (
        get_db()
        .table("posts")
        .select("*, topics(title, round_date, pillar_id, pillars(name))")
        .in_("status", IN_FLIGHT)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return PostOut(**rows[0]) if rows else None


@router.get("/{post_id}", response_model=PostOut)
def get_post(post_id: str) -> PostOut:
    rows = (
        get_db()
        .table("posts")
        .select("*, topics(title, round_date, pillar_id, pillars(name))")
        .eq("id", post_id)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "Post not found")
    return PostOut(**rows[0])


@router.patch("/{post_id}", response_model=PostOut)
def patch_post(post_id: str, body: PostPatchIn) -> PostOut:
    """Direct caption / hashtag edit — saved without AI rewrite."""
    rows = get_db().table("posts").select("id,status").eq("id", post_id).execute().data
    if not rows:
        raise HTTPException(404, "Post not found")
    if rows[0]["status"] != "awaiting_approval":
        raise HTTPException(409, "Can only edit posts that are awaiting approval")
    updates: dict = {}
    if body.caption is not None:
        updates["caption"] = body.caption
    if body.hashtags is not None:
        updates["hashtags"] = body.hashtags
    if not updates:
        raise HTTPException(422, "Nothing to update")
    result = (
        get_db()
        .table("posts")
        .update(updates)
        .eq("id", post_id)
        .select("*, topics(title, round_date, pillar_id, pillars(name))")
        .execute()
        .data
    )
    return PostOut(**result[0])


@router.post("/{post_id}/approve", response_model=PostOut)
def approve(post_id: str) -> PostOut:
    try:
        return PostOut(**orchestrator.approve_post(post_id))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/{post_id}/tweak")
def tweak(post_id: str, body: TweakIn) -> dict:
    try:
        orchestrator.tweak_post(post_id, body.instruction)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"status": "generating"}


@router.post("/{post_id}/reject", response_model=PostOut)
def reject(post_id: str) -> PostOut:
    try:
        return PostOut(**orchestrator.reject_post(post_id))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/{post_id}/retry")
def retry(post_id: str) -> dict:
    """Re-run generation after a crash left the post in topic_chosen."""
    rows = get_db().table("posts").select("status").eq("id", post_id).execute().data
    if not rows:
        raise HTTPException(404, "Post not found")
    if rows[0]["status"] != "topic_chosen":
        raise HTTPException(409, f"Post is '{rows[0]['status']}' — retry only from topic_chosen")
    orchestrator.spawn_generation(post_id)
    return {"status": "generating"}


@router.post("/{post_id}/publish")
def publish(post_id: str) -> dict:
    """Explicit publish / retry — allowed only when publish_status is 'failed' or 'manual'."""
    db = get_db()
    rows = db.table("posts").select("id,status,publish_status").eq("id", post_id).execute().data
    if not rows:
        raise HTTPException(404, "Post not found")
    row = rows[0]
    if row["status"] != "saved":
        raise HTTPException(409, "Can only publish saved posts")
    if row.get("publish_status") not in ("failed", "manual"):
        raise HTTPException(
            409,
            f"publish_status is '{row.get('publish_status')}' — retry only when failed or manual",
        )
    # Clear previous result so the frontend polling detects the in-progress state
    db.table("posts").update(
        {"publish_status": None, "publish_error": None, "updated_at": "now()"}
    ).eq("id", post_id).execute()
    orchestrator.spawn_publish(post_id)
    return {"status": "publishing"}


@router.post("/{post_id}/regenerate-images")
def regenerate_images(post_id: str) -> dict:
    """Image-only regenerate — keeps the caption, makes fresh images in the background."""
    rows = get_db().table("posts").select("status,format").eq("id", post_id).execute().data
    if not rows:
        raise HTTPException(404, "Post not found")
    if rows[0]["status"] != "awaiting_approval":
        raise HTTPException(
            409, f"Post is '{rows[0]['status']}' — regenerate only when awaiting approval"
        )
    if rows[0].get("format") != "post":
        raise HTTPException(409, "Only image posts have images to regenerate")
    orchestrator.spawn_image_regen(post_id)
    return {"status": "generating"}


@router.get("/{post_id}/versions")
def versions(post_id: str) -> list[dict]:
    """Refine-loop audit trail (post_versions)."""
    return (
        get_db()
        .table("post_versions")
        .select("*")
        .eq("post_id", post_id)
        .order("version_no")
        .execute()
        .data
    )
