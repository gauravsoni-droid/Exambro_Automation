"""Dev scheduler — APScheduler, 09:00 Asia/Kolkata (TRD §4).

Single uvicorn worker only. Deployed environments use an external HTTP cron
hitting POST /trigger instead (set ENABLE_APSCHEDULER=false there).
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.pipeline import orchestrator

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _daily_round() -> None:
    try:
        result = await orchestrator.run_topic_round()
        logger.info("Scheduled topic round: %s", result)
    except Exception:
        logger.exception("Scheduled topic round failed")


def start() -> None:
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
    _scheduler.add_job(
        _daily_round,
        CronTrigger(hour=9, minute=0, timezone="Asia/Kolkata"),
        id="daily_topic_round",
        coalesce=True,        # missed ticks collapse into one run
        misfire_grace_time=3600,
    )
    _scheduler.start()
    logger.info("APScheduler started — daily topic round at 09:00 IST")


def shutdown() -> None:
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
