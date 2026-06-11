"""Auth dependencies. Owner routes verify the Supabase JWT; /trigger uses a bearer token."""

import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.db import get_db

_bearer = HTTPBearer(auto_error=False)


async def require_owner(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Validate the Supabase access token (single owner — any valid user is the owner)."""
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        user = get_db().auth.get_user(creds.credentials)
        if user is None or user.user is None:
            raise ValueError("no user")
        return user.user.id
    except Exception as exc:
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
