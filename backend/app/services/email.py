"""Owner notifications via Resend (TRD §2). No-op when keys are missing (dev)."""

import logging

from app.config import get_settings

logger = logging.getLogger(__name__)


async def _send(subject: str, html: str) -> None:
    s = get_settings()
    if not (s.resend_api_key and s.notify_email_from and s.notify_email_to):
        logger.info("Email disabled (no Resend config) — would send: %s", subject)
        return
    import resend

    resend.api_key = s.resend_api_key
    try:
        resend.Emails.send(
            {
                "from": s.notify_email_from,
                "to": [s.notify_email_to],
                "subject": subject,
                "html": html,
            }
        )
    except Exception:
        # Notification failure must never kill the pipeline
        logger.exception("Email send failed: %s", subject)


async def notify_topics_ready() -> None:
    url = f"{get_settings().dashboard_base_url}/today"
    await _send(
        "ExamBro — आज के topics तैयार हैं",
        f'<p>3 topic suggestions are ready for today.</p><p><a href="{url}">Pick one →</a></p>',
    )


async def notify_post_ready(post_id: str) -> None:
    url = f"{get_settings().dashboard_base_url}/review/{post_id}"
    await _send(
        "ExamBro — post review के लिए तैयार है",
        f'<p>Your post is ready for review.</p><p><a href="{url}">Review it →</a></p>',
    )
