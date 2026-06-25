"""Image Maker — gpt-image-2 generation, single image or carousel (AI decides).

HARD RULE: any text rendered inside the image is ENGLISH ONLY (spec §2 — no
Hindi text-in-image). Phase-1 gate: prompts are manually tested and the client
signs off before this runs unattended.
"""

import base64
import logging
from datetime import datetime
from typing import Any

from app.agents import context, llm
from app.config import get_settings
from app.db import get_db
from app.schemas import Draft, ImagePlan

logger = logging.getLogger(__name__)

_PLAN_SYSTEM = (
    "You design Instagram images for ExamBro, an Indian exam-prep brand "
    "(JEE/NEET/CUET/GUJCET). Given a post topic and caption, write image-generation "
    "prompt(s) for gpt-image-2.\n\n"
    "RULES:\n"
    "- ANY text inside the image must be ENGLISH ONLY — short, bold, minimal "
    "(a heading, a number, a keyword). Never Hindi/Devanagari text in images.\n"
    "- Style: clean, modern, high-contrast education graphics; vibrant but not "
    "cluttered; consistent brand feel; portrait 4:5-friendly composition.\n"
    "- Prefer ONE strong image (quality over quantity). Use a 2-slide carousel "
    "(exactly 2 prompts) ONLY when the caption is clearly a multi-point list or "
    "step-by-step. NEVER produce more than 2 images.\n"
    "- Each prompt must be self-contained and explicit about layout, colors, and the "
    "exact English text to render (quote it).\n\n"
    'OUTPUT: return a JSON object with key "prompts" — an array of 1 or 2 image-generation '
    'strings you composed above — and key "is_carousel" (true only when 2 prompts). '
    "Do NOT return the schema itself. Fill in actual prompt text.\n"
    'Single-image example: {"prompts": ["Vivid blue portrait. Bold white heading: \'JEE MAINS 2025 Open\'. Subtext: \'Apply Now\'. Flat modern design."], "is_carousel": false}\n'
    'Carousel example: {"prompts": ["Slide 1: ...", "Slide 2: ..."], "is_carousel": true}'
)


async def plan_images(
    topic: dict[str, Any], draft: Draft, now: datetime | None = None
) -> ImagePlan:
    s = get_settings()
    settings_row = context.load_settings_row()
    ta_block = context.target_audience_block(settings_row)
    ctx_block = context.current_context(now) + "\n\n" if now is not None else ""
    system = ctx_block + _PLAN_SYSTEM + (f"\n\n{ta_block}" if ta_block else "")
    user = (
        f"Topic: {topic['title']} — {topic.get('description') or ''}\n\n"
        f"Caption (Hindi, for context only — image text must be English):\n"
        f"{draft.caption}\n\nWrite the image plan."
    )
    plan = await llm.complete_json(s.critic_provider, s.critic_model, system, user, ImagePlan)
    plan.is_carousel = len(plan.prompts) > 1
    return plan


async def generate_and_store(post_id: str, plan: ImagePlan) -> list[str]:
    """Generate via gpt-image-2 → upload to Supabase Storage → return paths."""
    from openai import AsyncOpenAI

    s = get_settings()
    client = AsyncOpenAI(api_key=s.openai_api_key)
    db = get_db()
    paths: list[str] = []
    for i, prompt in enumerate(plan.prompts, start=1):
        resp = await client.images.generate(
            model=s.image_model,
            prompt=prompt,
            size="1024x1536",  # portrait, closest to IG 4:5
            n=1,
        )
        image_bytes = base64.b64decode(resp.data[0].b64_json)
        path = f"posts/{post_id}/{i}.png"
        db.storage.from_("media").upload(
            path, image_bytes, {"content-type": "image/png", "upsert": "true"}
        )
        paths.append(path)
        logger.info("Stored image %s", path)
    return paths
