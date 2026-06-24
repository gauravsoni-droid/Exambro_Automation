"""Environment configuration. All secrets come from .env (repo root) — never hard-coded."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env — each app owns its env (frontend/.env is Vite's)
_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"

Provider = Literal["anthropic", "openai", "google", "kimi"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # AI providers
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""
    moonshot_api_key: str = ""

    # Models. Writer = Phase-0 bake-off winner (pin exact ID once picked).
    # Critic MUST be a different family from writer — validated at startup.
    writer_provider: Provider = "google"
    writer_model: str = "gemini-3.0-pro"
    critic_provider: Provider = "anthropic"
    critic_model: str = "claude-opus-4-8"
    news_provider: Provider = "anthropic"
    news_model: str = "claude-opus-4-8"
    image_model: str = "gpt-image-2"

    # Content language — constant "hi" for now; a parameter so English can come later
    content_language: str = "hi"

    # Scheduler / trigger
    trigger_token: str = ""
    enable_apscheduler: bool = True

    # Email (Resend)
    resend_api_key: str = ""
    notify_email_from: str = ""
    notify_email_to: str = ""

    dashboard_base_url: str = "http://localhost:5173"

    def validate_critic_family(self) -> None:
        if self.writer_provider == self.critic_provider:
            raise ValueError(
                f"critic ≠ writer rule violated: both are '{self.writer_provider}'. "
                "Critic must be a different model family (TRD §3)."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
