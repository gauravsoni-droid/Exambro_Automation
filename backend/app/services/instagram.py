"""Instagram Content Publishing via Meta Graph API v21.0.

Pattern mirrors email.py:
- Silent no-op when credentials are absent or auto-publish is off.
- All exceptions caught and logged — never propagate to approve_post().
- Credentials read exclusively from get_settings() / env; never stored in DB.
- Publish result (success or failure) written back to posts table.
"""

import asyncio
import logging
from typing import Any

import httpx

from app.config import get_settings
from app.db import get_db

logger = logging.getLogger(__name__)

_GRAPH_BASE = "https://graph.facebook.com/v21.0"
_POLL_INTERVAL_S = 3.0
_POLL_MAX_ATTEMPTS = 30   # 90 s total before giving up
_RETRY_ATTEMPTS = 2       # retries on 5xx errors before giving up
_IG_CAPTION_LIMIT = 2200  # Meta hard limit


# ── Internal helpers ──────────────────────────────────────────────────────────


def _public_image_url(path: str) -> str:
    """Build the public Supabase Storage URL for a media path."""
    base = get_settings().supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/public/media/{path}"


def _build_caption(caption: str, hashtags: list[str]) -> str:
    tags = " ".join(h if h.startswith("#") else f"#{h}" for h in hashtags)
    parts = [caption.strip(), tags.strip()]
    return "\n\n".join(p for p in parts if p)


async def _post(
    client: httpx.AsyncClient,
    url: str,
    params: dict[str, str],
) -> dict[str, Any]:
    """POST with retry on transient 5xx errors."""
    last_exc: Exception | None = None
    for attempt in range(_RETRY_ATTEMPTS + 1):
        try:
            resp = await client.post(url, params=params, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code < 500:
                raise  # 4xx → config / permission error; no point retrying
            last_exc = exc
            if attempt < _RETRY_ATTEMPTS:
                wait = 2.0 ** attempt
                logger.warning(
                    "IG API %s returned %s — retry %s/%s in %.0fs",
                    url, exc.response.status_code, attempt + 1, _RETRY_ATTEMPTS, wait,
                )
                await asyncio.sleep(wait)
    assert last_exc is not None  # every loop iteration that doesn't return sets this
    raise last_exc


async def _wait_until_ready(
    client: httpx.AsyncClient,
    container_id: str,
    token: str,
) -> None:
    """Poll a media container until status_code == FINISHED or ERROR."""
    for attempt in range(1, _POLL_MAX_ATTEMPTS + 1):
        await asyncio.sleep(_POLL_INTERVAL_S)
        resp = await client.get(
            f"{_GRAPH_BASE}/{container_id}",
            params={"fields": "status_code", "access_token": token},
            timeout=15,
        )
        resp.raise_for_status()
        status_code = resp.json().get("status_code", "IN_PROGRESS")
        logger.debug(
            "IG container %s → %s (poll %s/%s)",
            container_id, status_code, attempt, _POLL_MAX_ATTEMPTS,
        )
        if status_code == "FINISHED":
            return
        if status_code in ("ERROR", "EXPIRED"):
            raise RuntimeError(
                f"IG container {container_id} reached terminal state: {status_code}"
            )
    raise TimeoutError(
        f"IG container {container_id} not FINISHED after "
        f"{_POLL_MAX_ATTEMPTS * _POLL_INTERVAL_S:.0f}s"
    )


async def _create_single_container(
    client: httpx.AsyncClient,
    ig_user_id: str,
    token: str,
    image_url: str,
    caption: str,
) -> str:
    data = await _post(
        client,
        f"{_GRAPH_BASE}/{ig_user_id}/media",
        {"image_url": image_url, "caption": caption, "access_token": token},
    )
    return data["id"]


async def _create_carousel_item(
    client: httpx.AsyncClient,
    ig_user_id: str,
    token: str,
    image_url: str,
) -> str:
    data = await _post(
        client,
        f"{_GRAPH_BASE}/{ig_user_id}/media",
        {"image_url": image_url, "is_carousel_item": "true", "access_token": token},
    )
    return data["id"]


async def _create_carousel_container(
    client: httpx.AsyncClient,
    ig_user_id: str,
    token: str,
    child_ids: list[str],
    caption: str,
) -> str:
    data = await _post(
        client,
        f"{_GRAPH_BASE}/{ig_user_id}/media",
        {
            "media_type": "CAROUSEL",
            "children": ",".join(child_ids),
            "caption": caption,
            "access_token": token,
        },
    )
    return data["id"]


async def _publish_container(
    client: httpx.AsyncClient,
    ig_user_id: str,
    token: str,
    container_id: str,
) -> str:
    data = await _post(
        client,
        f"{_GRAPH_BASE}/{ig_user_id}/media_publish",
        {"creation_id": container_id, "access_token": token},
    )
    return data["id"]


# ── DB result writer ──────────────────────────────────────────────────────────


def _save_result(
    post_id: str,
    *,
    ig_post_id: str | None = None,
    status: str,
    error: str | None = None,
) -> None:
    """Write publish outcome to posts table. Swallows its own exceptions."""
    try:
        updates: dict[str, Any] = {"publish_status": status, "updated_at": "now()"}
        if ig_post_id:
            updates["instagram_post_id"] = ig_post_id
            updates["published_at"] = "now()"
        if error:
            updates["publish_error"] = error[:1000]  # guard against huge error strings
        get_db().table("posts").update(updates).eq("id", post_id).execute()
    except Exception:
        logger.exception("IG: failed to save publish result for post %s", post_id)


# ── Public entry point ────────────────────────────────────────────────────────


async def publish_post(post_id: str, *, force: bool = False) -> None:
    """Publish an approved post to Instagram.

    Called fire-and-forget from approve_post() via _spawn(), or directly
    from the retry endpoint (force=True bypasses the ig_auto_publish gate).
    Never raises — all failures are logged and stored in publish_error.
    """
    s = get_settings()

    if not force:
        # ig_auto_publish lives in the settings DB table (not env)
        try:
            settings_row = (
                get_db().table("settings").select("ig_auto_publish").limit(1).execute().data
            )
            ig_auto_publish: bool = bool(settings_row[0]["ig_auto_publish"]) if settings_row else False
        except Exception:
            logger.exception("IG: failed to read ig_auto_publish from settings table for post %s", post_id)
            ig_auto_publish = False

        if not ig_auto_publish:
            logger.debug("IG auto-publish is off — marking post %s as manual", post_id)
            _save_result(post_id, status="manual")
            return

    if not s.ig_access_token or not s.ig_user_id:
        logger.warning("IG_ACCESS_TOKEN or IG_USER_ID not set — publish failed for post %s", post_id)
        _save_result(post_id, status="failed", error="Instagram credentials not configured")
        return

    # Load only the fields we need
    try:
        row = (
            get_db()
            .table("posts")
            .select("format,caption,hashtags,image_paths,is_carousel")
            .eq("id", post_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        logger.exception("IG: failed to load post %s", post_id)
        return

    # Reels have no image — skip silently (not a failure)
    if row.get("format") != "post":
        logger.info(
            "IG: post %s is format=%r — only image posts are published via API",
            post_id, row.get("format"),
        )
        return

    image_paths: list[str] = row.get("image_paths") or []
    if not image_paths:
        logger.warning("IG: post %s has no image_paths — cannot publish", post_id)
        _save_result(post_id, status="failed", error="No images to publish")
        return

    caption = _build_caption(row.get("caption") or "", row.get("hashtags") or [])
    if len(caption) > _IG_CAPTION_LIMIT:
        logger.warning(
            "IG: post %s caption is %d chars (limit %d) — truncating",
            post_id, len(caption), _IG_CAPTION_LIMIT,
        )
        caption = caption[:_IG_CAPTION_LIMIT]
    is_carousel = bool(row.get("is_carousel")) and len(image_paths) > 1

    logger.info(
        "IG: publishing post %s (carousel=%s, images=%s)", post_id, is_carousel, len(image_paths)
    )

    try:
        async with httpx.AsyncClient() as client:
            token = s.ig_access_token
            uid = s.ig_user_id

            if is_carousel:
                # Step 1: create a child container for each slide
                child_ids: list[str] = []
                for path in image_paths:
                    child_id = await _create_carousel_item(
                        client, uid, token, _public_image_url(path)
                    )
                    await _wait_until_ready(client, child_id, token)
                    child_ids.append(child_id)
                    logger.info("IG: carousel child ready %s (%s/%s)", child_id, len(child_ids), len(image_paths))

                # Step 2: combine into a carousel container
                container_id = await _create_carousel_container(
                    client, uid, token, child_ids, caption
                )
            else:
                # Single image
                container_id = await _create_single_container(
                    client, uid, token, _public_image_url(image_paths[0]), caption
                )

            logger.info("IG: container created %s", container_id)

            # Step 3: wait for processing
            await _wait_until_ready(client, container_id, token)
            logger.info("IG: container %s ready", container_id)

            # Step 4: publish
            ig_post_id = await _publish_container(client, uid, token, container_id)

        logger.info("IG: post %s published → ig_media_id=%s", post_id, ig_post_id)
        _save_result(post_id, ig_post_id=ig_post_id, status="published")

    except httpx.HTTPStatusError as exc:
        error = f"HTTP {exc.response.status_code}: {exc.response.text[:400]}"
        logger.error("IG: publish failed for post %s — %s", post_id, error)
        _save_result(post_id, status="failed", error=error)

    except TimeoutError as exc:
        error = str(exc)
        logger.error("IG: container timeout for post %s — %s", post_id, error)
        _save_result(post_id, status="failed", error=error)

    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        logger.exception("IG: unexpected error for post %s", post_id)
        _save_result(post_id, status="failed", error=error[:500])
