"""X (Twitter) social posting endpoint."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from xdk import Client

from tweepy_client import X_BEARER_TOKEN

client = Client(bearer_token="AAAAAAAAAAAAAAAAAAAAANMa8QEAAAAAjOFRuic%2BzbXHtNpsPh5HNJoh6FI%3DGQraKUymJZ21xGxrkBFaccGGmuwcz04jFALHOAgeIo5Lxw04Io")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/x", tags=["x"])

_MAX_TWEET_LENGTH = 280


class PostRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=_MAX_TWEET_LENGTH)


@router.get("/test")
def test_x_endpoint():
    """Test endpoint to verify X client is working. Auth required."""
    try:
        # Import the client
        # Fetch recent Posts mentioning "api"
        # search_recent returns an Iterator, so iterate over it
        for page in client.posts.search_recent(query="api", max_results=10):
            if page.data and len(page.data) > 0:
                # Access first Post - Pydantic models support both attribute and dict access
                first_post = page.data[0]
                post_text = first_post.text if hasattr(first_post, 'text') else first_post.get('text', '')
                print(f"Latest Post: {post_text}")
                break
            else:
                print("No Posts found.")
                break
    except Exception as exc:
        logger.error("Failed to fetch X timeline: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch X timeline.")

@router.post("/post")
def create_x_post(
    body: PostRequest,
):
    """Create an X (Twitter) post. Auth required.

    Requires the X app to have *Read and Write* permissions and the
    access token/secret to have been generated *after* those permissions
    were enabled. Pass user_auth=True so Tweepy uses OAuth 1.0a instead
    of the Bearer token — without it you will get a 401.
    """
    try:
        # client = get_x_client()
        # user_auth=True is required to use OAuth 1.0a credentials.
        # Without it, Tweepy defaults to Bearer token (OAuth 2.0) which
        # does not carry write permissions and will return HTTP 401.
        response = client.create_tweet(text=body.text, user_auth=True)
        tweet_id = response.data["id"]
        return {
            "success": True,
            "data": {
                "tweet_id": tweet_id,
                "url": f"https://x.com/i/web/status/{tweet_id}",
                "text": body.text,
            },
        }
    except Exception as exc:
        logger.error("Failed to create X post: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to create X post.")
