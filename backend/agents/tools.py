"""LangChain tools and Bedrock graph helpers for the campaign creation agent."""

import os
from typing import Any, Optional, Sequence, cast

import httpx
from langchain_aws import ChatBedrockConverse
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

BASE_URL = os.getenv("AGENT_BACKEND_BASE_URL", "http://localhost:8000")
DEFAULT_MODEL_ID = "mistral.mistral-large-2402-v1:0"
DEFAULT_REGION = "us-east-1"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@tool
def save_event_field(session_id: str, field: str, value: Any, token: str) -> dict:
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


AGENT_TOOLS = [
    save_event_field,
    check_conflicts,
    suggest_nearby_pantries,
    create_campaign,
    generate_flyer,
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
]


def _filter_tools_by_name(tools: Sequence[Any], tool_names: Optional[Sequence[str]] = None):
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
    def _save_event_field(field: str, value: Any) -> dict:
        return save_event_field.invoke({
            "session_id": session_id,
            "field": field,
            "value": value,
            "token": token,
        })

    @tool("check_conflicts", description=check_conflicts.__doc__)
    def _check_conflicts() -> dict:
        return check_conflicts.invoke({"session_id": session_id, "token": token})

    @tool("suggest_nearby_pantries", description=suggest_nearby_pantries.__doc__)
    def _suggest_nearby_pantries() -> dict:
        return suggest_nearby_pantries.invoke({"session_id": session_id, "token": token})

    @tool("create_campaign", description=create_campaign.__doc__)
    def _create_campaign() -> dict:
        return create_campaign.invoke({"session_id": session_id, "token": token})

    @tool("generate_flyer", description=generate_flyer.__doc__)
    def _generate_flyer(template_id: str = "") -> dict:
        return generate_flyer.invoke({
            "session_id": session_id,
            "token": token,
            "template_id": template_id,
        })

    return [
        _save_event_field,
        _check_conflicts,
        _suggest_nearby_pantries,
        _create_campaign,
        _generate_flyer,
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
