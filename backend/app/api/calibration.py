"""Phase-0 Critic Accuracy Test — throwaway review screen API (Appflow §5).

Blind protocol: the owner's verdict is saved FIRST; the critic's verdict is
revealed only in the response to that save. Pass gate: ≥80% agreement (40/50).

Calibration v2 (CD13 NOW phase): generate-batch runs the real writer→critic
pipeline for 50 diverse exam topics and stores results. Owner judging and
retune are deferred (CD13 LATER — owner not yet available).
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.agents import context, critic, writer
from app.api.deps import require_owner
from app.db import get_db
from app.schemas import (
    CalibrationBatchStatus,
    CalibrationItemOut,
    CalibrationLabelIn,
    CalibrationSummary,
    Draft,
    PostFormat,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/calibration", tags=["calibration"], dependencies=[Depends(require_owner)]
)

# ── Batch generation state (module-level, single-user app) ─────────────────
_batch: dict = {"generating": False, "generated": 0, "total": 50, "error": None}
_batch_tasks: set[asyncio.Task] = set()  # strong refs — prevents GC mid-flight

# ── 50 diverse exam topic seeds (10 per standard pillar theme) ─────────────
_TOPIC_SEEDS: list[tuple[str, str]] = [
    # Exam news & updates
    ("JEE Mains 2025 Registration Dates", "NTA opens JEE Mains application window — key deadlines and steps"),
    ("NEET 2025 Exam Schedule Announced", "Official NEET UG examination dates and city centre list"),
    ("CUET 2025 Notification Released", "CUET UG application process, eligibility and syllabus overview"),
    ("JEE Advanced 2025 Eligibility Criteria", "Who can appear for JEE Advanced — rank cutoff and attempt rules"),
    ("GUJCET 2025 Exam Pattern Update", "Gujarat CET announces changes to paper pattern and marking scheme"),
    ("NTA Releases JEE Mains Admit Card", "How to download JEE Mains hall ticket — step-by-step guide"),
    ("NEET 2024 Result and Cutoff Analysis", "State-wise NEET cutoffs and topper score breakdown"),
    ("JEE Mains Session 2 Registration Open", "Dates, documents and fee for JEE Mains April session"),
    ("CUET PG 2025 Important Dates", "CUET PG exam schedule, application window and result date"),
    ("JEE Main Percentile vs Rank Explained", "How NTA calculates JEE Mains percentile and all-India rank"),
    # Study tips & strategy
    ("5-Hour Daily Study Schedule for JEE", "Optimal daily routine for JEE aspirants balancing all three subjects"),
    ("Last Month Revision Strategy for NEET", "High-yield topics to focus on in the final 30 days before exam"),
    ("How to Tackle JEE Maths in 3 Months", "Subject-wise plan to master JEE Mathematics from scratch"),
    ("NEET Biology — High Weightage Chapters", "Chapters carrying the most marks in the NEET Biology section"),
    ("Time Management During JEE Exam", "Pacing strategies to attempt all questions within the time limit"),
    ("How to Use NCERT for NEET Effectively", "Line-by-line NCERT reading technique for Biology mastery"),
    ("Reducing Negative Marking in JEE Mains", "When to attempt and when to skip — a practical decision framework"),
    ("Creating Your Personalised JEE Timetable", "Custom schedule tips for Class 12 students balancing boards"),
    ("Physical Chemistry Roadmap for JEE", "Chapter sequence and resource recommendation for PhyChem"),
    ("NEET Organic Chemistry Quick Revision", "Most important reactions and name reactions for NEET exam"),
    # PYQ / concept
    ("JEE Mains 2024 Mathematics PYQ Analysis", "Trend analysis and most repeated topics from the previous year"),
    ("NEET 2024 Biology Important Questions", "Previous year questions with solutions and explanations"),
    ("Coordinate Geometry for JEE — Key Concepts", "Circle, parabola, ellipse — formula sheet and shortcuts"),
    ("Human Physiology NEET PYQ Review", "Most asked questions from digestive and circulatory systems"),
    ("Electrostatics Conceptual Questions JEE", "Common tricky questions on Coulomb's law and field lines"),
    ("Cell Biology NEET Concept Master", "Cell organelles — function, structure and exam question patterns"),
    ("Organic Chemistry NEET PYQ Patterns", "Name reactions asked in NEET across the last 5 years"),
    ("JEE Mains Algebra PYQ Breakdown", "Sequences, matrices, complex numbers — pattern and solutions"),
    ("Thermodynamics JEE Important Questions", "Laws of thermodynamics and PYQ with step-by-step solutions"),
    ("Genetics and Evolution NEET MCQs", "Monohybrid, dihybrid and evolution PYQ with detailed answers"),
    # Motivation
    ("How to Overcome Exam Anxiety", "Practical mindset tips to stay calm during JEE and NEET preparation"),
    ("From Average Scores to JEE Rank Under 5000", "Real improvement strategies that actually move the needle"),
    ("Dealing With a Bad Mock Test Score", "What to do after a disappointing practice test result"),
    ("Staying Consistent When Motivation Is Low", "Building discipline when initial excitement fades in long prep"),
    ("Sleep and Study — The JEE Aspirant Balance", "Why 7 hours of sleep makes your study sessions sharper"),
    ("How Toppers Think Differently", "Mindset patterns from JEE and NEET rankers worth adopting"),
    ("Managing Parent Pressure During Board Season", "Healthy communication tips for students and families"),
    ("Bouncing Back After a Difficult Week", "Weekly reset rituals that keep your preparation momentum going"),
    ("Why Small Daily Wins Lead to Big Results", "The compound effect explained through JEE and NEET preparation"),
    ("What to Do in the Last 48 Hours Before Exam", "Revision, rest and mindset for the evening before your exam"),
    # Product / app
    ("ExamBro Mock Test — How to Use It", "Step-by-step guide to taking a timed mock test on ExamBro"),
    ("JEE Mock Test Analysis on ExamBro", "How to review errors and improve weak areas with ExamBro analytics"),
    ("NEET Chapter-wise Practice on ExamBro", "Targeted Biology, Physics, Chemistry practice organised by chapter"),
    ("ExamBro PYQ Module — Past Papers Made Easy", "Solve 10 years of PYQs topic-wise with full solutions"),
    ("Progress Tracking on ExamBro App", "Visual performance graphs and daily streak tracker explained"),
    ("ExamBro Doubts Feature — Ask Anything", "How to get instant step-by-step explanations on tough questions"),
    ("Custom Mock Test Builder in ExamBro", "Create your own test with subject and chapter filters"),
    ("ExamBro Leaderboard — Compete and Improve", "Rank among peers and identify your weak spots visually"),
    ("Revision Planner Feature on ExamBro", "Smart revision schedule built around your personal weak chapters"),
    ("Why 1 Lakh+ Students Use ExamBro", "Top features that make ExamBro the preferred app for exam prep"),
]


async def _run_batch_generation() -> None:
    """Background task: write→critique 50 posts and store in calibration_items.

    _batch["generating"] is set True by the endpoint before this task is
    scheduled, so batch-status reflects the correct state from the moment
    the endpoint returns — no race window.
    """
    try:
        db = get_db()  # inside try so any startup failure is covered by finally
        settings_row = context.load_settings_row()
        language = context.content_language()
        pillars = context.load_active_pillars()
        if not pillars:
            _batch["error"] = "No active pillars configured in Settings."
            return  # finally still runs → generating reset to False

        for i, (title, description) in enumerate(_TOPIC_SEEDS):
            pillar = pillars[i % len(pillars)]
            topic = {"title": title, "description": description, "pillar_id": pillar["id"]}
            try:
                draft = await writer.write_draft(topic, PostFormat.post, language, settings_row)
                crit = await critic.critique_draft(
                    draft, topic, PostFormat.post, language, settings_row
                )
                db.table("calibration_items").insert({
                    "content": draft.caption,
                    "hashtags": draft.hashtags,
                    "critic_verdict": crit.verdict.value,
                    "critic_score": crit.overall_score,
                }).execute()
            except Exception as exc:
                logger.warning("Calibration post %d/%d failed: %s", i + 1, len(_TOPIC_SEEDS), exc)
            _batch["generated"] = i + 1

    except Exception as exc:
        logger.error("Batch generation aborted: %s", exc)
        _batch["error"] = str(exc)
    finally:
        _batch["generating"] = False


# ── New NOW-phase endpoints ─────────────────────────────────────────────────

@router.post("/generate-batch")
async def generate_batch() -> dict:
    """CD13 NOW — trigger writer→critic pipeline for 50 test posts."""
    if _batch["generating"]:
        raise HTTPException(409, "Batch generation is already in progress.")

    db = get_db()
    count = db.table("calibration_items").select("id", count="exact").execute().count or 0

    if count >= 50:
        # Full batch already exists — nothing to do.
        raise HTTPException(409, "50 test posts already exist.")

    if 0 < count < 50:
        # Partial batch from an interrupted run — clear and start fresh.
        db.table("calibration_items").delete().not_.is_("id", "null").execute()

    # Set state before scheduling so batch-status is correct the moment this
    # endpoint returns — eliminates the race window where a concurrent request
    # or an immediate poll would see generating=False (Risk 1 fix).
    _batch.update(generating=True, generated=0, error=None)

    # Hold a strong reference so the event loop cannot GC the task mid-run
    # (matches the pattern in orchestrator._spawn — Risk 2 fix).
    task = asyncio.create_task(_run_batch_generation())
    _batch_tasks.add(task)
    task.add_done_callback(_batch_tasks.discard)

    return {"started": True}


@router.get("/batch-status", response_model=CalibrationBatchStatus)
def batch_status() -> CalibrationBatchStatus:
    """Poll generation progress — no DB hit."""
    return CalibrationBatchStatus(**_batch)


@router.get("/items", response_model=list[CalibrationItemOut])
def all_items() -> list[CalibrationItemOut]:
    """Return all calibration items for the batch list view."""
    rows = (
        get_db()
        .table("calibration_items")
        .select("id,content,hashtags,owner_verdict,owner_feedback,owner_comments,critic_verdict,critic_score,agreed")
        .order("created_at")
        .execute()
        .data
    )
    return [CalibrationItemOut(**r) for r in rows]


# ── Existing endpoints (unchanged) ─────────────────────────────────────────

class SeedIn(BaseModel):
    contents: list[str]


@router.post("/seed")
def seed(body: SeedIn) -> dict:
    """Load sample posts manually (legacy path — generate-batch preferred)."""
    rows = [{"content": c} for c in body.contents]
    get_db().table("calibration_items").insert(rows).execute()
    return {"inserted": len(rows)}


@router.get("/next", response_model=CalibrationItemOut | None)
def next_item() -> CalibrationItemOut | None:
    """Next unlabeled item — critic fields stripped (blind)."""
    rows = (
        get_db()
        .table("calibration_items")
        .select("id,content,hashtags")
        .is_("owner_verdict", "null")
        .order("created_at")
        .limit(1)
        .execute()
        .data
    )
    return CalibrationItemOut(**rows[0]) if rows else None


_FEEDBACK_TO_VERDICT: dict[str, str] = {
    "approve": "good",
    "needs_changes": "needs_work",
    "reject": "needs_work",
}


@router.post("/{item_id}/label", response_model=CalibrationItemOut)
async def label(item_id: str, body: CalibrationLabelIn) -> CalibrationItemOut:
    """Save the owner's feedback verdict, run + reveal the critic's score."""
    db = get_db()
    rows = db.table("calibration_items").select("*").eq("id", item_id).execute().data
    if not rows:
        raise HTTPException(404, "Item not found")
    item = rows[0]
    if item["owner_verdict"] is not None:
        raise HTTPException(409, "Already labeled")

    verdict_value = _FEEDBACK_TO_VERDICT[body.feedback]
    db.table("calibration_items").update({
        "owner_verdict": verdict_value,
        "owner_feedback": body.feedback,
        "owner_comments": body.comments,
        "owner_labeled_at": "now()",
    }).eq("id", item_id).execute()

    if item["critic_verdict"] is None:
        now = context.today_ist()
        settings_row = context.load_settings_row()
        crit = await critic.critique_draft(
            Draft(caption=item["content"], hashtags=item.get("hashtags") or []),
            {"title": "Calibration sample", "description": ""},
            PostFormat.post,
            context.content_language(),
            settings_row,
            now=now,
        )
        db.table("calibration_items").update(
            {"critic_verdict": crit.verdict.value, "critic_score": crit.overall_score}
        ).eq("id", item_id).execute()

    final = db.table("calibration_items").select("*").eq("id", item_id).execute().data[0]
    return CalibrationItemOut(**final)


@router.post("/rerun-critic", response_model=CalibrationSummary)
async def rerun_critic() -> CalibrationSummary:
    """Retest after a rubric change: re-run the critic on all owner-labeled items."""
    db = get_db()
    items = (
        db.table("calibration_items")
        .select("id,content,hashtags")
        .not_.is_("owner_verdict", "null")
        .execute()
        .data
    )
    settings_row = context.load_settings_row()
    for item in items:
        crit = await critic.critique_draft(
            Draft(caption=item["content"], hashtags=item.get("hashtags") or []),
            {"title": "Calibration sample", "description": ""},
            PostFormat.post,
            context.content_language(),
            settings_row,
        )
        db.table("calibration_items").update(
            {"critic_verdict": crit.verdict.value, "critic_score": crit.overall_score}
        ).eq("id", item["id"]).execute()
    return summary()


@router.post("/promote")
def promote() -> dict:
    """Promote agreed calibration items into golden_examples for Writer/Critic few-shot."""
    db = get_db()
    candidates = (
        db.table("calibration_items")
        .select("content,owner_verdict")
        .eq("agreed", True)
        .execute()
        .data
    )
    existing_captions = {
        r["caption"]
        for r in db.table("golden_examples").select("caption").execute().data
    }
    to_insert = []
    skipped = 0
    for item in candidates:
        if item["content"] in existing_captions:
            skipped += 1
            continue
        to_insert.append({
            "caption": item["content"],
            "label": "good" if item["owner_verdict"] == "good" else "bad",
            "notes": "Promoted from calibration",
        })
    if to_insert:
        db.table("golden_examples").insert(to_insert).execute()
    return {"promoted_count": len(to_insert), "skipped_count": skipped}


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
