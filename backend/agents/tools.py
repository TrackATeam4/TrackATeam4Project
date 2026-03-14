"""LangChain tools for the campaign creation agent.

Each tool makes an authenticated HTTP call to the FastAPI backend.
The AI team wires these into their AgentExecutor in campaign_agent.py.

Usage:
    from agents.tools import AGENT_TOOLS
    # then pass AGENT_TOOLS to create_tool_calling_agent / create_react_agent
"""

import httpx
from langchain_core.tools import tool

BASE_URL = "http://localhost:8000"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@tool
def save_event_field(session_id: str, field: str, value: str, token: str) -> dict:
    """Save a single collected event field to the session context.

    Call this every time the user provides a piece of information.
    Valid fields: title, location, address, latitude, longitude, date,
    start_time, end_time, max_volunteers, target_flyers, tags, food_pantry_id.
    Dates must be YYYY-MM-DD. Times must be HH:MM (24-hour).
    """
    r = httpx.post(
        f"{BASE_URL}/chat/session/{session_id}/context",
        json={"field": field, "value": value},
        headers=_headers(token),
    )
    return r.json()


@tool
def check_conflicts(session_id: str, token: str) -> dict:
    """Check for scheduling conflicts near the session location on the same date.

    Requires latitude, longitude, and date to already be saved in the session.
    Call this BEFORE create_campaign and warn the user if has_conflict is true.
    """
    r = httpx.get(
        f"{BASE_URL}/chat/session/{session_id}/check-conflicts",
        headers=_headers(token),
    )
    return r.json()


@tool
def suggest_nearby_pantries(session_id: str, token: str) -> dict:
    """Find food pantries within 5km of the session location.

    Requires latitude and longitude to already be saved in the session.
    If pantries are found, offer to link one to the campaign.
    """
    r = httpx.get(
        f"{BASE_URL}/chat/session/{session_id}/suggest-pantries",
        headers=_headers(token),
    )
    return r.json()


@tool
def create_campaign(session_id: str, token: str) -> dict:
    """Create the campaign from all collected session context.

    Only call this when ALL required fields are present:
    title, location, address, date, start_time, end_time.
    Always call check_conflicts before this tool.
    """
    r = httpx.post(
        f"{BASE_URL}/chat/session/{session_id}/create-campaign",
        headers=_headers(token),
    )
    return r.json()


@tool
def generate_flyer(session_id: str, token: str, template_id: str = "") -> dict:
    """Generate a flyer for the campaign created in this session.

    Call immediately after create_campaign succeeds.
    Optionally pass a template_id; if omitted the default active template is used.
    Returns flyer_url and thumbnail_url.
    """
    body = {"template_id": template_id} if template_id else {}
    r = httpx.post(
        f"{BASE_URL}/chat/session/{session_id}/generate-flyer",
        json=body,
        headers=_headers(token),
    )
    return r.json()


# Pass this list to your AgentExecutor
AGENT_TOOLS = [
    save_event_field,
    check_conflicts,
    suggest_nearby_pantries,
    create_campaign,
    generate_flyer,
]
