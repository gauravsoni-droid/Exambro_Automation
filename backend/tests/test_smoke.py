"""Smoke tests — app imports, routes registered, config rules enforced.

No network: DB/LLM calls are not exercised here.
"""

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.schemas import Critique, CritiqueAxis, Draft, TopicRound, TopicSuggestion, Verdict


def test_app_imports_and_routes():
    from app.main import app

    paths = {r.path for r in app.routes}
    for expected in (
        "/health",
        "/topics/today",
        "/topics/{topic_id}/pick",
        "/topics/reject-all",
        "/posts/current",
        "/posts/{post_id}/approve",
        "/posts/{post_id}/tweak",
        "/posts/{post_id}/reject",
        "/ideas",
        "/settings",
        "/pillars",
        "/queue",
        "/queue/stats",
        "/trigger",
        "/calibration/next",
        "/calibration/summary",
    ):
        assert expected in paths, f"missing route {expected}"


def test_critic_family_rule():
    s = Settings(writer_provider="anthropic", critic_provider="anthropic")
    with pytest.raises(ValueError, match="critic"):
        s.validate_critic_family()
    s2 = Settings(writer_provider="google", critic_provider="anthropic")
    s2.validate_critic_family()  # no raise


def test_language_is_a_parameter():
    """Hard requirement: language never hard-coded — prompts take it as an arg."""
    from app.agents.context import LANGUAGE_NAMES, language_rule

    assert "hi" in LANGUAGE_NAMES
    rule_hi = language_rule("hi", ["JEE"])
    rule_en = language_rule("en", ["JEE"])
    assert "Hindi" in rule_hi and "Devanagari" in rule_hi
    assert rule_hi != rule_en


def test_schemas_validate():
    TopicRound(
        topics=[
            TopicSuggestion(title=f"t{i}", description="d", pillar_id=f"p{i}") for i in range(3)
        ]
    )
    with pytest.raises(ValidationError):
        TopicRound(topics=[TopicSuggestion(title="t", description="d", pillar_id="p")])

    Draft(caption="नमस्ते", hashtags=["#JEE"])
    c = Critique(
        verdict=Verdict.needs_work,
        overall_score=5.5,
        axes=[CritiqueAxis(axis="hook", score=4, comment="weak")],
        never_post_violation=False,
    )
    assert c.verdict == Verdict.needs_work


def test_critic_pass_logic():
    from app.agents.critic import passes

    good = Critique(verdict=Verdict.good, overall_score=9, axes=[])
    assert passes(good)
    violated = Critique(
        verdict=Verdict.good, overall_score=9, axes=[], never_post_violation=True
    )
    assert not passes(violated)
