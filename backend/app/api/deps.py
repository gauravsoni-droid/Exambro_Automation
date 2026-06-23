"""Auth dependencies. Owner routes verify the Supabase JWT; /trigger uses a bearer token."""

import logging  # DEV ONLY
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.db import get_db

_bearer = HTTPBearer(auto_error=False)
_log = logging.getLogger(__name__)  # DEV ONLY


async def require_owner(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Validate the Supabase access token (single owner — any valid user is the owner)."""
    # DEV ONLY — remove before production
    _log.warning("[AUTH DEBUG] creds is None: %s", creds is None)
    if creds is not None:
        _log.warning("[AUTH DEBUG] token[:20]: %s", creds.credentials[:20])
    # END DEV ONLY

    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        user = get_db().auth.get_user(creds.credentials)
        # DEV ONLY
        _log.warning("[AUTH DEBUG] get_user result: %s", user)
        # END DEV ONLY
        if user is None or user.user is None:
            raise ValueError("no user")
        return user.user.id
    except Exception as exc:
        # DEV ONLY
        _log.warning("[AUTH DEBUG] exception: %s", exc)
        # END DEV ONLY
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc


async def require_trigger_token(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """External-cron auth for POST /trigger (TRD §4)."""
    expected = get_settings().trigger_token
    if not expected:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "TRIGGER_TOKEN not configured")
    if creds is None or not secrets.compare_digest(creds.credentials, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad trigger token")
