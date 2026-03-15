import logging
from typing import Annotated

from atproto import Client as ATClient
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from bsky_client import BSKY_PASSWORD, BSKY_USERNAME, get_bsky_client


router = APIRouter(prefix="/bsky", tags=["bsky"])
logger = logging.getLogger(__name__)

class PostBody(BaseModel):
    content: str

@router.post(
    "/post",
    responses={502: {"description": "Failed to post to Bluesky."}},
)
def create_bluesky_post(body: PostBody, atclient: Annotated[ATClient, Depends(get_bsky_client)]):
    """Create a social media post on Bluesky within a campaign."""
    try:
        profile = atclient.login(BSKY_USERNAME, BSKY_PASSWORD)
        print(f"Logged in as: {profile.handle}")
        atclient.post(body.content)
        return {"message": "Successfully posted to Bluesky!"}
    except Exception as exc:
        logger.error("Failed to post to Bluesky: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to post to Bluesky.")
