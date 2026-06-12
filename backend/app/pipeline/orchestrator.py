"""Pipeline orchestrator — the deterministic state machine (Appflow §1).

topics_ready → topic_chosen → generating → content_ready → awaiting_approval
→ approved/saved | rejected | tweak (→ generating)

Hand-rolled on purpose (TRD §2: no LangChain). Idempotent per round-date;
missed days wait safely; strictly ONE post in flight.
"""

import asyncio
import logging
from datetime import date, timedelta
from typing import Any

from app.agents import (
    context,
    critic,
    format_decider,
    image_maker,
    news_search,
    reel_scripter,
    topic_decider,
    writer,
)
from app.config import get_settings
from app.db import get_db
from app.schemas import Cadence, Draft, PostFormat, PostStatus, TopicStatus
from app.services import email

logger = logging.getLogger(__name__)

IN_FLIGHT_STATUSES = [
    PostStatus.topic_chosen,
    PostStatus.generating,
    PostStatus.content_ready,
    PostStatus.awaiting_approval,
]

MAX_CRITIC_LOOPS = 3


# ── Round / topic stage ──────────────────────────────────────────────────────


def _post_in_flight() -> bool:
    rows = (
        get_db()
        .table("posts")
        .select("id")
        .in_("status", [s.value for s in IN_FLIGHT_STATUSES])
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)


def _unpicked_topics_waiting() -> bool:
    rows = (
        get_db()
        .table("topics")
        .select("id")
        .eq("status", TopicStatus.suggested.value)
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)


def _cadence_due(today: date, cadence: Cadence) -> bool:
    if cadence == Cadence.daily:
        return True
    rows = (
        get_db()
        .table("topics")
        .select("round_date")
        .order("round_date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return True
    last = date.fromisoformat(rows[0]["round_date"])
    return (today - last) >= timedelta(days=2)


def _yesterdays_picked_pillar(today: date) -> str | None:
    rows = (
        get_db()
        .table("topics")
        .select("pillar_id,round_date")
        .eq("status", TopicStatus.picked.value)
        .lt("round_date", today.isoformat())
        .order("round_date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["pillar_id"] if rows else None


def _pending_idea() -> dict[str, Any] | None:
    rows = (
        get_db()
        .table("ideas")
        .select("*")
        .eq("status", "pending")
        .order("created_at")
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


async def run_topic_round(
    today: date | None = None, rejected_titles: list[str] | None = None
) -> dict[str, Any]:
    """09:00 IST entry point (scheduler / POST /trigger). Safe to re-run."""
    db = get_db()
    today = today or date.today()
    settings_row = context.load_settings_row()

    # Idempotency + missed-day + one-in-flight guards
    existing = (
        db.table("topics").select("id").eq("round_date", today.isoformat()).limit(1).execute().data
    )
    if existing and not rejected_titles:
        return {"skipped": "round already exists for today"}
    if _post_in_flight():
        return {"skipped": "a post is in flight — one post at a time"}
    if _unpicked_topics_waiting() and not rejected_titles:
        return {"skipped": "earlier topics still waiting for Tap 1 (missed-day queue)"}
    if not _cadence_due(today, Cadence(settings_row.get("cadence", "daily"))):
        return {"skipped": "cadence is every_2_days — not due today"}

    pillars = context.load_active_pillars()
    if len(pillars) < 3:
        raise RuntimeError("Need at least 3 active pillars for a topic round")

    idea = _pending_idea()
    news = await news_search.fetch_exam_news()
    round_ = await topic_decider.decide_topics(
        pillars=pillars,
        yesterdays_pillar_id=_yesterdays_picked_pillar(today),
        pending_idea=idea,
        news=news,
        settings_row=settings_row,
        rejected_titles=rejected_titles,
    )

    rows = []
    for slot, t in enumerate(round_.topics, start=1):
        rows.append(
            {
                "round_date": today.isoformat(),
                "slot": slot,
                "title": t.title,
                "description": t.description,
                "pillar_id": t.pillar_id,
                "is_rotation_exception": t.is_rotation_exception,
                "from_idea_id": idea["id"] if (idea and slot == 1) else None,
                "source_refs": t.source_refs,
                "status": TopicStatus.suggested.value,
            }
        )
    db.table("topics").insert(rows).execute()

    if idea:
        db.table("ideas").update(
            {"status": "used", "used_at": "now()"}
        ).eq("id", idea["id"]).execute()

    await email.notify_topics_ready()
    return {"created": 3, "round_date": today.isoformat()}


def pick_topic(topic_id: str) -> dict[str, Any]:
    """Tap 1 — owner picks 1 of 3. Returns the new post row (generation runs async)."""
    db = get_db()
    topic = db.table("topics").select("*").eq("id", topic_id).single().execute().data
    if topic["status"] != TopicStatus.suggested.value:
        raise ValueError(f"Topic is '{topic['status']}', not suggested")
    if _post_in_flight():
        raise ValueError("A post is already in flight")

    db.table("topics").update({"status": TopicStatus.picked.value}).eq("id", topic_id).execute()
    db.table("topics").update({"status": TopicStatus.rejected.value}).eq(
        "round_date", topic["round_date"]
    ).neq("id", topic_id).eq("status", TopicStatus.suggested.value).execute()
    db.table("approvals").insert({"topic_id": topic_id, "action": "tap1_pick"}).execute()

    post = (
        db.table("posts")
        .insert(
            {
                "topic_id": topic_id,
                "language": get_settings().content_language,
                "status": PostStatus.topic_chosen.value,
            }
        )
        .execute()
        .data[0]
    )
    return post


async def reject_all_topics(round_date: date) -> dict[str, Any]:
    """Tap 1 — reject all 3 → regenerate 3 fresh, state stays topics_ready."""
    db = get_db()
    suggested = (
        db.table("topics")
        .select("id,title")
        .eq("round_date", round_date.isoformat())
        .eq("status", TopicStatus.suggested.value)
        .execute()
        .data
    )
    if not suggested:
        raise ValueError("No suggested topics to reject for that round")
    db.table("topics").update({"status": TopicStatus.rejected.value}).in_(
        "id", [t["id"] for t in suggested]
    ).execute()
    db.table("approvals").insert({"action": "tap1_reject_all"}).execute()
    return await run_topic_round(
        today=round_date, rejected_titles=[t["title"] for t in suggested]
    )


# ── Generation stage (writer ⇄ critic ⇄ image/script) ───────────────────────


def _latest_version_no(post_id: str) -> int:
    rows = (
        get_db()
        .table("post_versions")
        .select("version_no")
        .eq("post_id", post_id)
        .order("version_no", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["version_no"] if rows else 0


def _save_version(post_id: str, version_no: int, draft: Draft, crit) -> None:
    get_db().table("post_versions").insert(
        {
            "post_id": post_id,
            "version_no": version_no,
            "caption": draft.caption,
            "hashtags": draft.hashtags,
            "script": draft.script,
            "critic_score": crit.overall_score,
            "critic_verdict": crit.verdict.value,
            "critique": crit.model_dump(mode="json"),
        }
    ).execute()


async def run_generation(post_id: str, tweak_instruction: str | None = None) -> None:
    """topic_chosen/awaiting_approval → generating → content_ready → awaiting_approval.

    Every draft + critique lands in post_versions. After MAX_CRITIC_LOOPS fails
    the draft still goes to the owner — the owner is the final gate (Appflow §4).
    """
    db = get_db()
    post = db.table("posts").select("*").eq("id", post_id).single().execute().data
    topic = db.table("topics").select("*").eq("id", post["topic_id"]).single().execute().data
    settings_row = context.load_settings_row()
    language = post["language"]

    db.table("posts").update({"status": PostStatus.generating.value}).eq("id", post_id).execute()

    try:
        if post.get("format"):
            format_ = PostFormat(post["format"])
        else:
            decision = await format_decider.decide_format(topic)
            format_ = PostFormat(decision.format)
            db.table("posts").update({"format": format_.value}).eq("id", post_id).execute()

        # Writer ⇄ critic loop (≤3×). A tweak resumes from the owner's instruction.
        previous: Draft | None = None
        instructions = tweak_instruction or ""
        if tweak_instruction:
            prev_row = (
                db.table("post_versions")
                .select("caption,hashtags,script")
                .eq("post_id", post_id)
                .order("version_no", desc=True)
                .limit(1)
                .execute()
                .data
            )
            if prev_row:
                previous = Draft(**prev_row[0])

        version_no = _latest_version_no(post_id)
        draft, crit = None, None
        for _ in range(MAX_CRITIC_LOOPS):
            draft = await writer.write_draft(
                topic, format_, language, settings_row,
                revision_instructions=instructions, previous_draft=previous,
            )
            crit = await critic.critique_draft(draft, topic, format_, language, settings_row)
            version_no += 1
            _save_version(post_id, version_no, draft, crit)
            if critic.passes(crit):
                break
            previous, instructions = draft, crit.revision_instructions
        if not critic.passes(crit):
            logger.warning("Post %s: critic still failing after %s loops — owner is final gate",
                           post_id, MAX_CRITIC_LOOPS)

        db.table("posts").update(
            {
                "caption": draft.caption,
                "hashtags": draft.hashtags,
                "script": draft.script,
                "critic_score": crit.overall_score,
                "status": PostStatus.content_ready.value,
                "updated_at": "now()",
            }
        ).eq("id", post_id).execute()

        # Image (post) or shoot-ready script (reel)
        if format_ == PostFormat.post:
            plan = await image_maker.plan_images(topic, draft)
            image_paths = await image_maker.generate_and_store(post_id, plan)
            db.table("posts").update(
                {"image_paths": image_paths, "is_carousel": plan.is_carousel}
            ).eq("id", post_id).execute()
        else:
            final_script = await reel_scripter.finalize_script(
                draft.script or draft.caption, topic, language, settings_row
            )
            db.table("posts").update({"script": final_script}).eq("id", post_id).execute()

        db.table("posts").update(
            {"status": PostStatus.awaiting_approval.value, "updated_at": "now()"}
        ).eq("id", post_id).execute()
        await email.notify_post_ready(post_id)
    except Exception:
        # Leave a breadcrumb state; owner can retry from the dashboard
        logger.exception("Generation failed for post %s", post_id)
        db.table("posts").update(
            {"status": PostStatus.topic_chosen.value, "updated_at": "now()"}
        ).eq("id", post_id).execute()
        raise


async def regenerate_images(post_id: str) -> None:
    """Image-only regenerate (Tap-2 'Regenerate image' button).

    Keeps the approved caption/hashtags/script — re-runs ONLY the image plan +
    generation. Flips to `generating` so the review screen polls, then restores
    `awaiting_approval` with fresh images (or restores it on failure).
    """
    db = get_db()
    post = db.table("posts").select("*").eq("id", post_id).single().execute().data
    if post["status"] != PostStatus.awaiting_approval.value:
        raise ValueError(f"Post is '{post['status']}', expected 'awaiting_approval'")
    if post.get("format") != PostFormat.post.value:
        raise ValueError("Only image posts can regenerate images")
    topic = db.table("topics").select("*").eq("id", post["topic_id"]).single().execute().data

    db.table("posts").update(
        {"status": PostStatus.generating.value, "image_paths": [], "updated_at": "now()"}
    ).eq("id", post_id).execute()
    try:
        draft = Draft(
            caption=post.get("caption") or "",
            hashtags=post.get("hashtags") or [],
            script=post.get("script"),
        )
        plan = await image_maker.plan_images(topic, draft)
        image_paths = await image_maker.generate_and_store(post_id, plan)
        db.table("posts").update(
            {
                "image_paths": image_paths,
                "is_carousel": plan.is_carousel,
                "status": PostStatus.awaiting_approval.value,
                "updated_at": "now()",
            }
        ).eq("id", post_id).execute()
    except Exception:
        logger.exception("Image regeneration failed for post %s", post_id)
        db.table("posts").update(
            {"status": PostStatus.awaiting_approval.value, "updated_at": "now()"}
        ).eq("id", post_id).execute()
        raise


_main_loop: asyncio.AbstractEventLoop | None = None
_bg_tasks: set[asyncio.Task] = set()


def capture_event_loop() -> None:
    """Called from lifespan startup so threadpool endpoints can schedule work."""
    global _main_loop
    _main_loop = asyncio.get_running_loop()


def _spawn(make_coro) -> None:
    """Fire-and-forget a coroutine — the pipeline takes minutes; callers return now.

    Sync endpoints run in Starlette's threadpool where there is no running
    loop, so the coroutine is handed to the main loop captured at startup.
    """

    async def _run() -> None:
        try:
            await make_coro()
        except Exception:
            logger.exception("Background task crashed")

    try:
        task = asyncio.get_running_loop().create_task(_run())
        _bg_tasks.add(task)  # keep a ref — bare tasks can be GC'd mid-flight
        task.add_done_callback(_bg_tasks.discard)
    except RuntimeError:
        if _main_loop is None:
            raise RuntimeError(
                "spawn called from a thread before the event loop was captured "
                "(capture_event_loop runs at app startup)"
            ) from None
        asyncio.run_coroutine_threadsafe(_run(), _main_loop)


def spawn_generation(post_id: str, tweak_instruction: str | None = None) -> None:
    _spawn(lambda: run_generation(post_id, tweak_instruction))


def spawn_image_regen(post_id: str) -> None:
    _spawn(lambda: regenerate_images(post_id))


# ── Tap 2 ────────────────────────────────────────────────────────────────────


def approve_post(post_id: str) -> dict[str, Any]:
    """Tap 2 Approve → approved package saved in DB. NO publish (Phase 3)."""
    db = get_db()
    _require_status(post_id, PostStatus.awaiting_approval)
    db.table("approvals").insert({"post_id": post_id, "action": "tap2_approve"}).execute()
    return (
        db.table("posts")
        .update({"status": PostStatus.saved.value, "updated_at": "now()"})
        .eq("id", post_id)
        .execute()
        .data[0]
    )


def tweak_post(post_id: str, instruction: str) -> None:
    """Tap 2 Tweak — free-text → back to writer (critic re-checks) → awaiting_approval."""
    db = get_db()
    _require_status(post_id, PostStatus.awaiting_approval)
    db.table("approvals").insert(
        {"post_id": post_id, "action": "tap2_tweak", "tweak_text": instruction}
    ).execute()
    spawn_generation(post_id, tweak_instruction=instruction)


def reject_post(post_id: str) -> dict[str, Any]:
    """Tap 2 Reject — round over; next scheduled round runs normally."""
    db = get_db()
    _require_status(post_id, PostStatus.awaiting_approval)
    db.table("approvals").insert({"post_id": post_id, "action": "tap2_reject"}).execute()
    return (
        db.table("posts")
        .update({"status": PostStatus.rejected.value, "updated_at": "now()"})
        .eq("id", post_id)
        .execute()
        .data[0]
    )


def _require_status(post_id: str, expected: PostStatus) -> None:
    post = get_db().table("posts").select("status").eq("id", post_id).single().execute().data
    if post["status"] != expected.value:
        raise ValueError(f"Post is '{post['status']}', expected '{expected.value}'")
