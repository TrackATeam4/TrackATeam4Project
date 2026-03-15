from dotenv import load_dotenv
import os
from atproto import Client

load_dotenv()

BSKY_USERNAME=os.getenv("BSKY_USERNAME")
BSKY_PASSWORD=os.getenv("BSKY_PASSWORD")

bsky_client = Client()

def get_bsky_client():
    """Authenticate and return a client for Bluesky API calls."""
    return bsky_client
