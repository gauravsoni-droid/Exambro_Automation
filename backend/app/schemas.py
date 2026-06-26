"""Pydantic models — the contract between agents, pipeline, API, and frontend.

LLM outputs are parsed into these models (typed schemas per TRD §2); a parse
failure means the agent retries, never that bad data enters the DB.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

# ── Enums (mirror DB enums in 0001_initial_schema.sql) ─────────────────────


class Cadence(StrEnum):
    daily = "daily"
    every_2_days = "every_2_days"


class PostFormat(StrEnum):
    post = "post"
    reel = "reel"


class PostStatus(StrEnum):
    topic_chosen = "topic_chosen"
    generating = "generating"
    content_ready = "content_ready"
    awaiting_approval = "awaiting_approval"
    approved = "approved"
    rejected = "rejected"
    saved = "saved"


class TopicStatus(StrEnum):
    suggested = "suggested"
    picked = "picked"
    rejected = "rejected"


class IdeaType(StrEnum):
    text = "text"
    image = "image"
    link = "link"


class IdeaStatus(StrEnum):
    pending = "pending"
    used = "used"
    discarded = "discarded"


class ApprovalAction(StrEnum):
    tap1_pick = "tap1_pick"
    tap1_reject_all = "tap1_reject_all"
    tap2_approve = "tap2_approve"
    tap2_tweak = "tap2_tweak"
    tap2_reject = "tap2_reject"


class Verdict(StrEnum):
    good = "good"
    needs_work = "needs_work"


# ── LLM output schemas (agents must return these) ──────────────────────────


class TopicSuggestion(BaseModel):
    """One of the 3 daily topic suggestions."""

    title: str
    description: str = Field(description="One-line description")
    pillar_id: str
    is_rotation_exception: bool = False
    source_refs: list[str] = Field(default_factory=list, description="News/citation URLs")


class TopicRound(BaseModel):
    topics: list[TopicSuggestion] = Field(min_length=3, max_length=3)


class FormatDecision(BaseModel):
    format: Literal["post", "reel"]
    is_carousel: bool = False
    reasoning: str = ""


class Draft(BaseModel):
    """Writer output. Caption/script in pure Hindi (Devanagari) per language rule."""

    caption: str
    hashtags: list[str]
    script: str | None = None  # reel only


class CritiqueAxis(BaseModel):
    axis: str  # hook | brand_voice | grammar_spelling | language_rule | factual | cta | hashtags
    score: float = Field(ge=0, le=10)
    comment: str = ""


class Critique(BaseModel):
    """Critic output. never_post_violation is a HARD fail regardless of score."""

    verdict: Verdict
    overall_score: float = Field(ge=0, le=10)
    axes: list[CritiqueAxis]
    never_post_violation: bool = False
    violation_detail: str = ""
    revision_instructions: str = Field(
        default="", description="What the writer must fix (empty when verdict is good)"
    )


class ImagePlan(BaseModel):
    """Image Maker decision — single image or carousel, with English-only text."""

    prompts: list[str] = Field(min_length=1, max_length=2)  # quality over quantity — ≤2 images
    is_carousel: bool = False


class NewsItem(BaseModel):
    headline: str
    summary: str
    url: str = ""
    exam: str = ""  # JEE Mains | JEE Advanced | NEET | CUET | GUJCET
    is_urgent: bool = False


class NewsDigest(BaseModel):
    items: list[NewsItem] = Field(default_factory=list)


class CompetitorTheme(BaseModel):
    theme: str
    handle_count: int = 1  # how many tracked accounts post this theme


class CompetitorDigest(BaseModel):
    """Output of competitor_fetcher — themes only, never raw captions."""
    trending_themes: list[CompetitorTheme] = Field(default_factory=list)
    content_gaps: list[str] = Field(default_factory=list)
    overused_topics: list[str] = Field(default_factory=list)


class PerformanceDigest(BaseModel):
    """Output of performance_fetcher — aggregated from owner feedback and post history.

    Primary source: approvals (tap1_pick rate per pillar, tap2 outcomes).
    Secondary source: metrics table (saves + shares) when Phase-2 ingestion runs.
    Minimum sample: 5 analysed posts — digest is empty below this threshold.
    """
    strong_pillars: list[str] = Field(default_factory=list)
    weak_pillars: list[str] = Field(default_factory=list)
    high_performing_topics: list[str] = Field(default_factory=list)
    weak_topics: list[str] = Field(default_factory=list)
    preferred_format: str | None = None
    total_posts_analyzed: int = 0


class ExamPhase(StrEnum):
    off_season   = "off_season"
    registration = "registration"
    preparation  = "preparation"
    revision     = "revision"
    exam_week    = "exam_week"
    results      = "results"
    counselling  = "counselling"


class ExamEvent(BaseModel):
    exam_name: str
    exam_date: date


class AdaptiveContext(BaseModel):
    """Output of exam_calendar_fetcher — current exam phase for pillar weighting.

    When adaptive_strategy_enabled = False the fetcher returns None (no block injected).
    When enabled, phase is always set; exam reference fields are optional.
    """
    phase: ExamPhase = ExamPhase.off_season
    nearest_exam_name: str | None = None
    days_to_exam: int | None = None    # set when a future exam is the reference point
    days_since_exam: int | None = None  # set when a past exam is the reference point


# ── API DTOs ────────────────────────────────────────────────────────────────


class TopicDecisionTrace(BaseModel):
    """Decision trace stored as topics.decision_trace (JSONB).

    Built deterministically from active signal inputs AFTER the LLM returns —
    no chain-of-thought, no internal prompts. Safe to expose to the owner.
    """
    pillar_name: str | None = None
    selection_reasons: list[str] = Field(default_factory=list)
    owner_idea: bool = False
    breaking_news: bool = False
    business_foundation: bool = False
    performance_signal: bool = False
    competitor_signal: bool = False
    adaptive_strategy: bool = False
    exam_phase: str | None = None


class TopicOut(BaseModel):
    id: str
    round_date: date
    slot: int
    title: str
    description: str | None = None
    pillar_id: str | None = None
    pillar_name: str | None = None
    is_rotation_exception: bool = False
    from_idea_id: str | None = None
    status: TopicStatus
    decision_trace: TopicDecisionTrace | None = None


class PillarRef(BaseModel):
    name: str | None = None


class PostTopicRef(BaseModel):
    """Topic + pillar context joined onto a post (mirrors queue's join)."""

    title: str | None = None
    round_date: date | None = None
    pillar_id: str | None = None
    pillars: PillarRef | None = None


class PostOut(BaseModel):
    id: str
    topic_id: str
    language: str
    format: PostFormat | None = None
    caption: str | None = None
    hashtags: list[str] = Field(default_factory=list)
    script: str | None = None
    image_paths: list[str] = Field(default_factory=list)
    is_carousel: bool = False
    critic_score: float | None = None
    status: PostStatus
    created_at: datetime | None = None
    topics: PostTopicRef | None = None
    instagram_post_id: str | None = None
    published_at: datetime | None = None
    publish_status: str | None = None
    publish_error: str | None = None


class IdeaIn(BaseModel):
    type: IdeaType
    payload: str
    image_path: str | None = None
    pillar_name: str | None = None


class IdeaOut(IdeaIn):
    id: str
    status: IdeaStatus
    used_at: datetime | None = None
    created_at: datetime | None = None


class PillarIn(BaseModel):
    name: str
    description: str | None = None
    active: bool = True
    sort_order: int = 0


class PillarOut(PillarIn):
    id: str


class SettingsOut(BaseModel):
    id: str
    cadence: Cadence
    bf_brand_name: str | None = None
    bf_who_we_serve: str | None = None
    bf_core_values: str | None = None
    bf_liked_topics: str | None = None
    bf_never_post: list[str] = Field(default_factory=list)
    ta_country: str | None = None
    ta_state: str | None = None
    ta_city: str | None = None
    ta_who: str | None = None
    english_allowlist: list[str] = Field(default_factory=list)
    competitor_handles: list[str] = Field(default_factory=list)
    content_language: str = 'hi'
    ig_auto_publish: bool = False
    adaptive_strategy_enabled: bool = True


class SettingsIn(BaseModel):
    cadence: Cadence | None = None
    bf_brand_name: str | None = None
    bf_who_we_serve: str | None = None
    bf_core_values: str | None = None
    bf_liked_topics: str | None = None
    bf_never_post: list[str] | None = None
    ta_country: str | None = None
    ta_state: str | None = None
    ta_city: str | None = None
    ta_who: str | None = None
    english_allowlist: list[str] | None = None
    competitor_handles: list[str] | None = None
    content_language: str | None = None
    ig_auto_publish: bool | None = None
    adaptive_strategy_enabled: bool | None = None


class TweakIn(BaseModel):
    instruction: str = Field(min_length=1)


class CalibrationItemOut(BaseModel):
    id: str
    content: str
    hashtags: list[str] = Field(default_factory=list)
    owner_verdict: Verdict | None = None
    owner_feedback: str | None = None   # approve | needs_changes | reject
    owner_comments: str | None = None
    critic_verdict: Verdict | None = None
    critic_score: float | None = None
    agreed: bool | None = None


class CalibrationLabelIn(BaseModel):
    feedback: Literal["approve", "needs_changes", "reject"]
    comments: str | None = None


class CalibrationSummary(BaseModel):
    total: int
    labeled: int
    agreed: int
    pass_gate: bool  # ≥80% agreement on 50 (40/50)


class CalibrationBatchStatus(BaseModel):
    generating: bool
    generated: int
    total: int
    error: str | None = None
