import logging
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import HTTPException, Header
from supabase import create_client

load_dotenv()

logger = logging.getLogger(__name__)


async def verify_token(authorization: Optional[str] = Header(None)):
    """Verify Supabase JWT from Authorization header. Returns UserResponse.

    Creates a fresh Supabase client per request so the shared singleton's
    cached session state never bleeds into JWT validation.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization scheme")

    token = authorization[7:]  # len("Bearer ") == 7
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    try:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_ANON_KEY")
        fresh_client = create_client(url, key)
        user = fresh_client.auth.get_user(token)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return user
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user(authorization: Optional[str] = Header(None)):
    """FastAPI dependency that returns the authenticated Supabase user."""
    return await verify_token(authorization)
