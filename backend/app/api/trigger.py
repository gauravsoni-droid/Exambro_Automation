"""POST /trigger — external-cron entry (TRD §4 contract).

Bearer auth → 202 immediately → pipeline runs async (external pingers
time out ~30s). Idempotent per round-date (orchestrator guards).
"""

import asyncio
import logging

from fastapi import APIRouter, Depends

from app.api.deps import require_trigger_token
from app.pipeline import orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(tags=["trigger"])


@router.post("/trigger", status_code=202, dependencies=[Depends(require_trigger_token)])
async def trigger() -> dict:
    async def _run() -> None:
        try:
            result = await orchestrator.run_topic_round()
            logger.info("Triggered topic round: %s", result)
        except Exception:
            logger.exception("Triggered topic round failed")

    asyncio.create_task(_run())
    return {"status": "accepted"}
