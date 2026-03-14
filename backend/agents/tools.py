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


# ── Campaign creation tools ───────────────────────────────────────────────────

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


# ── Invitation & email tools ──────────────────────────────────────────────────

@tool
def send_campaign_invite(campaign_id: str, email: str, token: str) -> dict:
    """Send an email invitation for a campaign to a single volunteer email address.

    Use this after create_campaign when the user wants to invite specific people.
    The volunteer receives a branded email with an RSVP link and a calendar (.ics) attachment.
    Returns invite_url which can be shared directly as a shareable link.

    Args:
        campaign_id: UUID of the campaign to invite to.
        email: Email address of the volunteer to invite.
        token: Auth token of the organizer.
    """
    r = httpx.post(
        f"{BASE_URL}/campaigns/{campaign_id}/invitations",
        json={"email": email},
        headers=_headers(token),
    )
    return r.json()


@tool
def send_bulk_invites(campaign_id: str, emails: list[str], token: str) -> dict:
    """Send email invitations to multiple volunteers at once for a campaign.

    Use this when the user provides several email addresses to invite.
    Calls send_campaign_invite for each email and returns a summary of results.

    Args:
        campaign_id: UUID of the campaign.
        emails: List of volunteer email addresses.
        token: Auth token of the organizer.
    """
    results = {"sent": [], "failed": [], "skipped": []}
    for email in emails:
        r = httpx.post(
            f"{BASE_URL}/campaigns/{campaign_id}/invitations",
            json={"email": email},
            headers=_headers(token),
        )
        data = r.json()
        if r.status_code == 201:
            results["sent"].append({"email": email, "invite_url": data.get("data", {}).get("invite_url")})
        elif r.status_code == 409:
            results["skipped"].append({"email": email, "reason": "already invited"})
        else:
            results["failed"].append({"email": email, "reason": data.get("detail", "unknown error")})

    total = len(emails)
    sent = len(results["sent"])
    summary = f"Sent {sent}/{total} invites."
    if results["skipped"]:
        summary += f" {len(results['skipped'])} already invited."
    if results["failed"]:
        summary += f" {len(results['failed'])} failed."

    return {"success": True, "summary": summary, "data": results}


@tool
def list_campaign_invitations(campaign_id: str, token: str) -> dict:
    """List all invitations for a campaign with their current RSVP status.

    Use this when the user asks who has been invited, who accepted, or who hasn't responded.
    Returns a list of invitations with email, status (pending/accepted/expired), and timestamps.

    Args:
        campaign_id: UUID of the campaign.
        token: Auth token of the organizer.
    """
    r = httpx.get(
        f"{BASE_URL}/campaigns/{campaign_id}/invitations",
        headers=_headers(token),
    )
    data = r.json()
    invitations = data.get("data", [])

    # Build a human-readable summary for the agent
    pending = [i for i in invitations if i["status"] == "pending"]
    accepted = [i for i in invitations if i["status"] == "accepted"]
    expired = [i for i in invitations if i["status"] == "expired"]

    summary = (
        f"{len(invitations)} total invitations: "
        f"{len(accepted)} accepted, {len(pending)} pending, {len(expired)} expired."
    )
    return {"success": True, "summary": summary, "data": invitations}


@tool
def get_campaign_calendar_url(campaign_id: str, token: str) -> dict:
    """Get a pre-filled Google Calendar 'Add Event' URL for a campaign.

    Use this when the user asks for a calendar link or wants to share the event
    on Google Calendar. The returned URL can be sent directly to volunteers.
    No Google API key is required — it's a plain shareable URL.

    Args:
        campaign_id: UUID of the campaign.
        token: Auth token of the caller.
    """
    r = httpx.get(
        f"{BASE_URL}/campaigns/{campaign_id}/calendar-url",
        headers=_headers(token),
    )
    data = r.json()
    url = data.get("data", {}).get("google_calendar_url", "")
    return {"success": True, "google_calendar_url": url}


@tool
def get_campaign_signups(campaign_id: str, token: str) -> dict:
    """List all volunteers who have signed up for a campaign and their attendance status.

    Use this when the user asks who signed up, how many volunteers confirmed,
    or wants to know the current headcount for their campaign.
    Status values: pending (signed up, not confirmed), confirmed (organizer confirmed attendance).

    Args:
        campaign_id: UUID of the campaign.
        token: Auth token of the organizer.
    """
    r = httpx.get(
        f"{BASE_URL}/campaigns/{campaign_id}/signups",
        headers=_headers(token),
    )
    data = r.json()
    signups = data.get("data", [])

    pending = [s for s in signups if s["status"] == "pending"]
    confirmed = [s for s in signups if s["status"] == "confirmed"]
    cancelled = [s for s in signups if s["status"] == "cancelled"]

    summary = (
        f"{len(signups)} total signups: "
        f"{len(confirmed)} confirmed, {len(pending)} pending, {len(cancelled)} cancelled."
    )
    return {"success": True, "summary": summary, "data": signups}


# ── Full tool registry ────────────────────────────────────────────────────────

# Pass this list to your AgentExecutor
AGENT_TOOLS = [
    # Campaign creation
    save_event_field,
    check_conflicts,
    suggest_nearby_pantries,
    create_campaign,
    generate_flyer,
    # Invitations & email
    send_campaign_invite,
    send_bulk_invites,
    list_campaign_invitations,
    # Calendar
    get_campaign_calendar_url,
    # Signups
    get_campaign_signups,
]
