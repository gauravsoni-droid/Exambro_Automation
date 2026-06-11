"""ExamBro IG Automation — FastAPI orchestrator entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import calibration, ideas, posts, queue, topics, trigger
from app.api import settings as settings_api
from app.config import get_settings
from app.services import scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    s.validate_critic_family()  # critic ≠ writer — fail fast at boot
    if s.enable_apscheduler:
        scheduler.start()
    yield
    if s.enable_apscheduler:
        scheduler.shutdown()


app = FastAPI(title="ExamBro IG Automation", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().dashboard_base_url, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(topics.router)
app.include_router(posts.router)
app.include_router(ideas.router)
app.include_router(settings_api.router)
app.include_router(settings_api.pillars_router)
app.include_router(queue.router)
app.include_router(trigger.router)
app.include_router(calibration.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
