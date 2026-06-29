"""Image Maker — gpt-image-2 generation, single image or carousel (AI decides).

HARD RULE: any text rendered inside the image is ENGLISH ONLY (spec §2 — no
Hindi text-in-image). Phase-1 gate: prompts are manually tested and the client
signs off before this runs unattended.

Logo compositing: after gpt-image-2 returns bytes, _overlay_logo() pastes the
official /brand/logos/exambro-logo.png onto the image programmatically.
The AI never draws or recreates the logo — it only keeps the safe zone clear.
"""

import base64
import io
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from app.agents import context, llm
from app.config import get_settings
from app.db import get_db
from app.schemas import Draft, ImagePlan

logger = logging.getLogger(__name__)

# Official logo asset — relative to this file inside the monorepo.
# parents: agents → app → backend → repo-root → frontend/public/brand/logos/
_LOGO_PNG = (
    Path(__file__).resolve().parents[3]
    / "frontend" / "public" / "brand" / "logos" / "exambro-logo.png"
)

# Placement constants (mirror _LOGO_SAFE_ZONE in context.py)
_LOGO_MAX_WIDTH_FRAC = 0.10   # ≤10 % of image width
_LOGO_MARGIN_FRAC    = 0.05   # 5 % safe inset from each edge
_LUMA_DARK_THRESHOLD = 128    # luminance < this → background is dark

# Fail loudly at import time so the server log shows the problem immediately,
# not silently on the first image generation attempt.
try:
    import PIL as _pil  # noqa: F401
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False
    logger.error(
        "Pillow is not installed — logo overlay disabled for all generated images. "
        "Fix: run `uv sync` inside the backend/ directory."
    )


def _region_luma(img: Any, x: int, y: int, w: int, h: int) -> float:
    """Average perceptual luminance of a rectangular region (PIL Image required)."""
    from PIL import ImageStat  # noqa: PLC0415
    region = img.crop((x, y, x + w, y + h)).convert("RGB")
    r_mean, g_mean, b_mean = ImageStat.Stat(region).mean
    return 0.299 * r_mean + 0.587 * g_mean + 0.114 * b_mean


def _load_logo_rgba(dark_bg: bool) -> Any:
    """
    Load the official logo PNG and return a Pillow RGBA Image.
    The asset already has a transparent background (no stripping needed).
    For dark backgrounds all visible pixels are recoloured white (light variant).
    Returns None on any failure so the caller skips the overlay gracefully.
    """
    if not _PIL_AVAILABLE:
        return None
    from PIL import Image  # noqa: PLC0415

    if not _LOGO_PNG.exists():
        logger.warning("Logo asset missing: %s", _LOGO_PNG)
        return None

    try:
        img = Image.open(_LOGO_PNG).convert("RGBA")
        if dark_bg:
            # Light variant: keep the alpha channel, recolour every visible pixel → white.
            # Band-split avoids the deprecated getdata() / putdata() pixel loop.
            _, _, _, a_band = img.split()
            white = Image.new("L", img.size, 255)
            img = Image.merge("RGBA", (white, white, white, a_band))
        return img
    except Exception as exc:
        logger.warning("Logo load failed: %s", exc, exc_info=True)
        return None


def _overlay_logo(image_bytes: bytes) -> bytes:
    """
    Composite the official ExamBro logo onto generated image bytes.

    Variant selection:
      dark background corner  → light (white) logo
      light background corner → dark (orange + blue) logo

    Placement: bottom-left corner, _LOGO_MARGIN_FRAC inset, ≤_LOGO_MAX_WIDTH_FRAC wide.
    Returns original bytes unchanged on any error (graceful fallback).
    """
    if not _PIL_AVAILABLE:
        return image_bytes
    from PIL import Image  # noqa: PLC0415

    try:
        bg = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        iw, ih = bg.size

        logo_w  = max(1, int(iw * _LOGO_MAX_WIDTH_FRAC))
        margin  = max(1, int(iw * _LOGO_MARGIN_FRAC))

        # Sample the bottom-left corner region to pick the correct logo variant.
        sample_h = max(1, int(ih * 0.12))
        luma = _region_luma(bg, margin, ih - sample_h - margin, logo_w, sample_h)
        dark_bg = luma < _LUMA_DARK_THRESHOLD

        logo = _load_logo_rgba(dark_bg)
        if logo is None:
            return image_bytes

        # Resize while preserving aspect ratio.
        ratio  = logo_w / logo.width
        logo_h = max(1, int(logo.height * ratio))
        logo   = logo.resize((logo_w, logo_h), Image.LANCZOS)

        x = margin
        y = ih - logo_h - margin

        if y < 0 or x + logo_w > iw:
            logger.warning("Logo placement out of image bounds — overlay skipped")
            return image_bytes

        bg.paste(logo, (x, y), logo)

        out = io.BytesIO()
        bg.convert("RGB").save(out, format="PNG")
        logger.info(
            "Logo overlay applied (variant=%s, pos=(%d,%d), size=%dx%d)",
            "light" if dark_bg else "dark", x, y, logo_w, logo_h,
        )
        return out.getvalue()

    except Exception as exc:
        logger.warning("Logo overlay failed: %s — returning original image", exc, exc_info=True)
        return image_bytes

_PLAN_SYSTEM = (
    "You design Instagram images for ExamBro, an Indian exam-prep brand "
    "(JEE/NEET/CUET/GUJCET). Given a post topic and caption, write image-generation "
    "prompt(s) for gpt-image-2.\n\n"
    "RULES:\n"
    "- ANY text inside the image must be ENGLISH ONLY — short, bold, minimal "
    "(a heading, a number, a keyword). Never Hindi/Devanagari text in images.\n"
    "- Style: clean, modern, high-contrast education graphics; portrait 4:5-friendly "
    "composition.\n"
    "- Colours: follow the EXAMBRO VISUAL BRAND IDENTITY section below exactly. "
    "Include hex codes explicitly in every prompt.\n"
    "- Logo: DO NOT draw, describe, or recreate the ExamBro logo — it is added "
    "programmatically after generation. Keep the bottom-left corner clear: "
    "no text or subjects within the left 12 % of width × bottom 12 % of height.\n"
    "- Prefer ONE strong image (quality over quantity). Use a 2-slide carousel "
    "(exactly 2 prompts) ONLY when the caption is clearly a multi-point list or "
    "step-by-step. NEVER produce more than 2 images.\n"
    "- Each prompt must be self-contained and explicit about layout, hex colours, "
    "and the exact English text to render (quote it).\n\n"
    'OUTPUT: return a JSON object with key "prompts" — an array of 1 or 2 image-generation '
    'strings you composed above — and key "is_carousel" (true only when 2 prompts). '
    "Do NOT return the schema itself. Fill in actual prompt text.\n"
    "Single-image example:\n"
    "{\"prompts\": [\"Portrait 4:5. Deep blue #2B89CA background panel. Bold orange "
    "#F58545 top strip. Large white #FFFFFF heading: 'JEE MAINS 2025 OPEN'. White "
    "subtext: 'Apply Now — Link in Bio'. Bottom-left corner kept clear (logo added "
    "in post-processing). Flat modern design, no gradients.\"], \"is_carousel\": false}\n"
    'Carousel example: {"prompts": ["Slide 1: ...", "Slide 2: ..."], "is_carousel": true}'
)


_PLAN_SYSTEM_CAROUSEL = _PLAN_SYSTEM.replace(
    "- Prefer ONE strong image (quality over quantity). Use a 2-slide carousel "
    "(exactly 2 prompts) ONLY when the caption is clearly a multi-point list or "
    "step-by-step. NEVER produce more than 2 images.",
    "- This is a CAROUSEL post — generate EXACTLY 2 image prompts (one per slide). "
    "Always return 2 prompts. NEVER return only 1 prompt.",
)


async def plan_images(
    topic: dict[str, Any],
    draft: Draft,
    now: datetime | None = None,
    is_carousel: bool = False,
) -> ImagePlan:
    s = get_settings()
    settings_row = context.load_settings_row()
    ta_block = context.target_audience_block(settings_row)
    bf_block = context.business_foundation_block(settings_row)
    visuals_block = context.brand_visuals_block()
    ctx_block = context.current_context(now) + "\n\n" if now is not None else ""
    plan_system = _PLAN_SYSTEM_CAROUSEL if is_carousel else _PLAN_SYSTEM
    system = (
        ctx_block
        + plan_system
        + (f"\n\n{ta_block}" if ta_block else "")
        + (f"\n\n{bf_block}" if bf_block else "")
        + f"\n\n{visuals_block}"
    )
    user = (
        f"Topic: {topic['title']} — {topic.get('description') or ''}\n\n"
        f"Caption (Hindi, for context only — image text must be English):\n"
        f"{draft.caption}\n\nWrite the image plan."
    )
    logger.info(
        "[CAROUSEL-TRACE 3/6] plan_images — received is_carousel=%s using_carousel_prompt=%s",
        is_carousel, is_carousel,
    )
    plan = await llm.complete_json(s.critic_provider, s.critic_model, system, user, ImagePlan)
    plan.is_carousel = len(plan.prompts) > 1
    logger.info(
        "[CAROUSEL-TRACE 3/6] plan_images — llm returned prompts=%d "
        "llm_is_carousel=%s → plan.is_carousel=%s",
        len(plan.prompts), len(plan.prompts) > 1, plan.is_carousel,
    )
    return plan


async def generate_and_store(post_id: str, plan: ImagePlan) -> list[str]:
    """Generate via gpt-image-2 → upload to Supabase Storage → return paths."""
    from openai import AsyncOpenAI

    logger.info(
        "[CAROUSEL-TRACE 4/6] generate_and_store — plan.is_carousel=%s prompts_count=%d",
        plan.is_carousel, len(plan.prompts),
    )
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
        image_bytes = _overlay_logo(image_bytes)   # composite official logo
        path = f"posts/{post_id}/{i}.png"
        db.storage.from_("media").upload(
            path, image_bytes, {"content-type": "image/png", "upsert": "true"}
        )
        paths.append(path)
        logger.info("Stored image %s", path)
    logger.info(
        "[CAROUSEL-TRACE 4/6] generate_and_store — generated_count=%d image_paths=%s",
        len(paths), paths,
    )
    return paths
