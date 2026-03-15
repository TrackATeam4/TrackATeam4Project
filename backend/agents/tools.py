"""LangChain tools and Bedrock graph helpers for the campaign creation agent."""

import os
from typing import Any, Optional, Sequence, cast

import httpx
from langchain_aws import ChatBedrockConverse
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

BASE_URL = os.getenv("AGENT_BACKEND_BASE_URL", "http://localhost:8000")
DEFAULT_MODEL_ID = "meta.llama3-3-70b-instruct-v1:0"
DEFAULT_REGION = "us-east-1"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _format_campaign_bsky_post(context: dict[str, Any], custom_text: str = "") -> str:
    """Build a Bluesky-friendly post from the saved campaign session context."""
    title = str(context.get("title", "")).strip()
    date = str(context.get("date", "")).strip()
    start_time = str(context.get("start_time", "")).strip()
    end_time = str(context.get("end_time", "")).strip()
    location = str(context.get("location", "")).strip()
    address = str(context.get("address", "")).strip()

    lines = []
    if custom_text.strip():
        lines.append(custom_text.strip())
    elif title:
        lines.append(f"Join our {title} campaign.")
    else:
        lines.append("Join our upcoming TrackATeam campaign.")

    details = []
    if date:
        details.append(f"Date: {date}")
    if start_time and end_time:
        details.append(f"Time: {start_time}-{end_time}")
    elif start_time:
        details.append(f"Time: {start_time}")
    if location:
        details.append(f"Location: {location}")
    if address:
        details.append(address)

    if details:
        lines.append(" | ".join(details))

    return "\n".join(lines)


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


@tool
def post_campaign_to_bluesky(
    session_id: str, token: str, custom_text: str = ""
) -> dict:
    """Create a Bluesky post for the campaign saved in this session.

    Call this after create_campaign succeeds so the post can use the saved
    campaign title, date, time, and location. Optionally provide custom_text
    to override the default opening line while still including campaign details.
    """
    session_response = httpx.get(
        f"{BASE_URL}/chat/session/{session_id}",
        headers=_headers(token),
    )
    session_data = session_response.json()
    session = session_data.get("session", {})
    context = session.get("context", {})
    if not context.get("campaign_id"):
        return {
            "success": False,
            "detail": "No campaign created yet in this session.",
        }

    content = _format_campaign_bsky_post(context, custom_text)
    post_response = httpx.post(
        f"{BASE_URL}/bsky/post",
        json={"content": content},
    )

    response_data = post_response.json()
    return {
        "success": post_response.is_success,
        "content": content,
        **response_data,
    }


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
            results["sent"].append(
                {"email": email, "invite_url": data.get("data", {}).get("invite_url")}
            )
        elif r.status_code == 409:
            results["skipped"].append({"email": email, "reason": "already invited"})
        else:
            results["failed"].append(
                {"email": email, "reason": data.get("detail", "unknown error")}
            )

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


AGENT_TOOLS = [
    save_event_field,
    check_conflicts,
    suggest_nearby_pantries,
    create_campaign,
    generate_flyer,
    post_campaign_to_bluesky,
    send_campaign_invite,
    send_bulk_invites,
    list_campaign_invitations,
    get_campaign_calendar_url,
    get_campaign_signups,
]

__all__ = [
    "AGENT_TOOLS",
    "resolve_tools",
    "build_request_tools",
    "build_bedrock_model",
    "build_bedrock_graph",
    "invoke_bedrock_graph",
    "stream_bedrock_graph",
    "save_event_field",
    "check_conflicts",
    "suggest_nearby_pantries",
    "create_campaign",
    "generate_flyer",
    "post_campaign_to_bluesky",
    "send_campaign_invite",
    "send_bulk_invites",
    "list_campaign_invitations",
    "get_campaign_calendar_url",
    "get_campaign_signups",
]


def _filter_tools_by_name(
    tools: Sequence[Any], tool_names: Optional[Sequence[str]] = None
):
    """Return all tools or only the subset requested by name."""
    if not tool_names:
        return list(tools)

    by_name = {tool_func.name: tool_func for tool_func in tools}
    selected = []
    for name in tool_names:
        if name not in by_name:
            raise ValueError(f"Unknown tool '{name}'. Available: {sorted(by_name)}")
        selected.append(by_name[name])
    return selected


def build_request_tools(session_id: str, token: str):
    """Create request-scoped tools with server-injected session auth context."""

    @tool("save_event_field", description=save_event_field.__doc__)
    def _save_event_field(field: str, value: str) -> dict:
        return save_event_field.invoke(
            {
                "session_id": session_id,
                "field": field,
                "value": value,
                "token": token,
            }
        )

    @tool("check_conflicts", description=check_conflicts.__doc__)
    def _check_conflicts() -> dict:
        return check_conflicts.invoke({"session_id": session_id, "token": token})

    @tool("suggest_nearby_pantries", description=suggest_nearby_pantries.__doc__)
    def _suggest_nearby_pantries() -> dict:
        return suggest_nearby_pantries.invoke(
            {"session_id": session_id, "token": token}
        )

    @tool("create_campaign", description=create_campaign.__doc__)
    def _create_campaign() -> dict:
        return create_campaign.invoke({"session_id": session_id, "token": token})

    @tool("generate_flyer", description=generate_flyer.__doc__)
    def _generate_flyer(template_id: str = "") -> dict:
        return generate_flyer.invoke(
            {
                "session_id": session_id,
                "token": token,
                "template_id": template_id,
            }
        )

    @tool("post_campaign_to_bluesky", description=post_campaign_to_bluesky.__doc__)
    def _post_campaign_to_bluesky(custom_text: str = "") -> dict:
        return post_campaign_to_bluesky.invoke(
            {
                "session_id": session_id,
                "token": token,
                "custom_text": custom_text,
            }
        )

    @tool("send_campaign_invite", description=send_campaign_invite.__doc__)
    def _send_campaign_invite(campaign_id: str, email: str) -> dict:
        return send_campaign_invite.invoke(
            {
                "campaign_id": campaign_id,
                "email": email,
                "token": token,
            }
        )

    @tool("send_bulk_invites", description=send_bulk_invites.__doc__)
    def _send_bulk_invites(campaign_id: str, emails: list[str]) -> dict:
        return send_bulk_invites.invoke(
            {
                "campaign_id": campaign_id,
                "emails": emails,
                "token": token,
            }
        )

    @tool("list_campaign_invitations", description=list_campaign_invitations.__doc__)
    def _list_campaign_invitations(campaign_id: str) -> dict:
        return list_campaign_invitations.invoke(
            {
                "campaign_id": campaign_id,
                "token": token,
            }
        )

    @tool("get_campaign_calendar_url", description=get_campaign_calendar_url.__doc__)
    def _get_campaign_calendar_url(campaign_id: str) -> dict:
        return get_campaign_calendar_url.invoke(
            {
                "campaign_id": campaign_id,
                "token": token,
            }
        )

    @tool("get_campaign_signups", description=get_campaign_signups.__doc__)
    def _get_campaign_signups(campaign_id: str) -> dict:
        return get_campaign_signups.invoke(
            {
                "campaign_id": campaign_id,
                "token": token,
            }
        )

    return [
        _save_event_field,
        _check_conflicts,
        _suggest_nearby_pantries,
        _create_campaign,
        _generate_flyer,
        _post_campaign_to_bluesky,
        _send_campaign_invite,
        _send_bulk_invites,
        _list_campaign_invitations,
        _get_campaign_calendar_url,
        _get_campaign_signups,
    ]


def resolve_tools(tool_names: Optional[Sequence[str]] = None):
    """Resolve tool callables by name; returns all tools when no names are given."""
    return _filter_tools_by_name(AGENT_TOOLS, tool_names)


def build_bedrock_model(
    model: Optional[str] = None,
    region_name: Optional[str] = None,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
) -> ChatBedrockConverse:
    """Build a Bedrock chat model using explicit args or env defaults."""
    return ChatBedrockConverse(
        model=model or os.getenv("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID),
        region_name=region_name or os.getenv("AWS_REGION", DEFAULT_REGION),
        temperature=temperature,
        max_tokens=max_tokens,
    )


def build_bedrock_graph(
    tool_names: Optional[Sequence[str]] = None,
    model: Optional[str] = None,
    region_name: Optional[str] = None,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
    session_id: Optional[str] = None,
    token: Optional[str] = None,
):
    """Create a LangGraph ReAct agent connected to Amazon Bedrock."""
    llm = build_bedrock_model(
        model=model,
        region_name=region_name,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if session_id is not None and token is not None:
        request_tools = build_request_tools(session_id=session_id, token=token)
        return create_react_agent(llm, _filter_tools_by_name(request_tools, tool_names))
    return create_react_agent(llm, resolve_tools(tool_names))


def invoke_bedrock_graph(
    user_input: str,
    tool_names: Optional[Sequence[str]] = None,
    model: Optional[str] = None,
    region_name: Optional[str] = None,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
    session_id: Optional[str] = None,
    token: Optional[str] = None,
) -> dict[str, Any]:
    """Invoke the Bedrock graph for one user message."""
    graph = build_bedrock_graph(
        tool_names=tool_names,
        model=model,
        region_name=region_name,
        temperature=temperature,
        max_tokens=max_tokens,
        session_id=session_id,
        token=token,
    )
    return cast(dict[str, Any], graph.invoke({"messages": [("user", user_input)]}))


def stream_bedrock_graph(
    user_input: str,
    tool_names: Optional[Sequence[str]] = None,
    model: Optional[str] = None,
    region_name: Optional[str] = None,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
    session_id: Optional[str] = None,
    token: Optional[str] = None,
):
    """Stream values from the Bedrock graph for one user message."""
    graph = build_bedrock_graph(
        tool_names=tool_names,
        model=model,
        region_name=region_name,
        temperature=temperature,
        max_tokens=max_tokens,
        session_id=session_id,
        token=token,
    )
    return graph.stream({"messages": [("user", user_input)]}, stream_mode="values")
