"""Chat router: session management, conversation turns, and agent tool endpoints."""

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Path
from pydantic import BaseModel, Field

from auth import get_current_user
from agent_app.chat_service import REQUIRED_FIELDS, VALID_CONTEXT_FIELDS
from supabase_client import get_supabase_client
from services.rewards import award_points, haversine_km

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

_UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

# `REQUIRED_FIELDS` and `VALID_CONTEXT_FIELDS` are shared from agent_app.chat_service.


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ChatMessageRequest(BaseModel):
    session_id: str = Field(..., pattern=_UUID_PATTERN)
    message: str = Field(..., min_length=1, max_length=2000)


class SaveContextRequest(BaseModel):
    field: str
    value: Any


class GenerateFlyerRequest(BaseModel):
    template_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fetch_session(supabase, session_id: str) -> dict:
    """Fetch a chat session by ID. Raises 404 if not found."""
    result = (
        supabase.table("chat_sessions")
        .select("*")
        .eq("id", session_id)
        .single()
        .execute()
    )
    session = result.data
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _verify_ownership(session: dict, user_id: str) -> None:
    """Raise 403 if the session does not belong to the user."""
    if session["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not your session")


def _merge_context(supabase, session_id: str, current_context: dict, field: str, value: Any) -> dict:
    """Merge a single field into the session context JSONB and persist."""
    merged = {**current_context, field: value}
    supabase.table("chat_sessions").update({"context": merged}).eq("id", session_id).execute()
    return merged


def _find_conflicts(supabase, context: dict) -> list[dict]:
    """Query campaigns on the same date within 2km of session location."""
    lat = context.get("latitude")
    lng = context.get("longitude")
    event_date = context.get("date")

    result = (
        supabase.table("campaigns")
        .select("id, title, date, start_time, latitude, longitude")
        .eq("date", event_date)
        .eq("status", "published")
        .execute()
    )
    conflicts = []
    for camp in (result.data or []):
        c_lat = camp.get("latitude")
        c_lng = camp.get("longitude")
        if c_lat is not None and c_lng is not None:
            dist = haversine_km(lat, lng, c_lat, c_lng)
            if dist < 2.0:
                conflicts.append({
                    "id": camp["id"],
                    "title": camp["title"],
                    "date": camp["date"],
                    "start_time": camp.get("start_time"),
                    "distance_km": round(dist, 2),
                })
    return conflicts


def _find_nearby_pantries(supabase, lat: float, lng: float) -> list[dict]:
    """Query food pantries within 5km of coordinates."""
    result = supabase.table("food_pantries").select("id, name, latitude, longitude, services").execute()
    pantries = []
    for p in (result.data or []):
        dist = haversine_km(lat, lng, p["latitude"], p["longitude"])
        if dist < 5.0:
            pantries.append({
                "id": p["id"],
                "name": p["name"],
                "distance_km": round(dist, 2),
                "services": p.get("services", []),
            })
    pantries.sort(key=lambda x: x["distance_km"])
    return pantries


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/session", status_code=201)
def create_session(
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Create a new chat session."""
    user_id = user.user.id
    result = supabase.table("chat_sessions").insert({
        "user_id": user_id,
        "context": {},
        "status": "active",
    }).execute()
    session = result.data[0]
    return {"session_id": session["id"], "context": session["context"]}


@router.get("/session/{session_id}")
def get_session(
    session_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Get a chat session with all messages."""
    session = _fetch_session(supabase, session_id)
    _verify_ownership(session, user.user.id)

    msg_result = (
        supabase.table("chat_messages")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return {"session": session, "messages": msg_result.data or []}


@router.post("/message")
def send_message(
    body: ChatMessageRequest,
    authorization: Optional[str] = Header(None),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Process a user message and return the agent reply."""
    session = _fetch_session(supabase, body.session_id)
    _verify_ownership(session, user.user.id)

    # Insert user message
    supabase.table("chat_messages").insert({
        "session_id": body.session_id,
        "role": "user",
        "content": body.message,
    }).execute()

    # Fetch message history
    history_result = (
        supabase.table("chat_messages")
        .select("role, content")
        .eq("session_id", body.session_id)
        .order("created_at")
        .execute()
    )
    messages = history_result.data or []

    # Lazy import to allow monkeypatching in tests
    format_history = _get_format_history()
    executor = _get_agent_executor()

    token = (authorization or "")[7:] if authorization else ""
    chat_history = format_history(messages)

    try:
        result = executor.invoke({
            "input": body.message,
            "chat_history": chat_history,
            "session_id": body.session_id,
            "token": token,
        })
        reply = result.get("output", "")
    except Exception as exc:
        logger.error("Agent invocation failed: %s", exc)
        if "botocore" in type(exc).__module__ or "boto" in type(exc).__module__:
            raise HTTPException(
                status_code=503,
                detail="AI service temporarily unavailable. Please try again later.",
            )
        raise HTTPException(status_code=500, detail="Failed to process message")

    # Insert assistant reply
    supabase.table("chat_messages").insert({
        "session_id": body.session_id,
        "role": "assistant",
        "content": reply,
    }).execute()

    # Refresh session context
    updated_session = _fetch_session(supabase, body.session_id)
    context = updated_session.get("context", {})

    action = None
    if context.get("campaign_id"):
        action = {
            "type": "campaign_created",
            "campaign_id": context["campaign_id"],
            "flyer_url": context.get("flyer_url"),
        }

    return {"reply": reply, "context": context, "action": action}


@router.post("/session/{session_id}/context")
def save_context(
    body: SaveContextRequest,
    session_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Save a single field to the session context (used by agent tool)."""
    session = _fetch_session(supabase, session_id)
    _verify_ownership(session, user.user.id)

    if body.field not in VALID_CONTEXT_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid field '{body.field}'. Valid fields: {sorted(VALID_CONTEXT_FIELDS)}",
        )

    merged = _merge_context(supabase, session_id, session["context"], body.field, body.value)
    return {"context": merged}


@router.get("/session/{session_id}/check-conflicts")
def check_conflicts(
    session_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Check for scheduling conflicts near the session location on the same date."""
    session = _fetch_session(supabase, session_id)
    _verify_ownership(session, user.user.id)

    context = session.get("context", {})
    missing = []
    for f in ("latitude", "longitude", "date"):
        if f not in context:
            missing.append(f)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing context fields for conflict check: {missing}",
        )

    conflicts = _find_conflicts(supabase, context)
    return {"has_conflict": len(conflicts) > 0, "conflicts": conflicts}


@router.get("/session/{session_id}/suggest-pantries")
def suggest_pantries(
    session_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Suggest nearby food pantries based on session coordinates."""
    session = _fetch_session(supabase, session_id)
    _verify_ownership(session, user.user.id)

    context = session.get("context", {})
    lat = context.get("latitude")
    lng = context.get("longitude")
    if lat is None or lng is None:
        raise HTTPException(
            status_code=400,
            detail="Missing latitude/longitude in session context",
        )

    pantries = _find_nearby_pantries(supabase, lat, lng)
    return {"pantries": pantries}


@router.post("/session/{session_id}/create-campaign", status_code=201)
def create_campaign_endpoint(
    session_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Create a campaign from the collected session context."""
    session = _fetch_session(supabase, session_id)
    _verify_ownership(session, user.user.id)

    context = session.get("context", {})
    missing = [f for f in REQUIRED_FIELDS if f not in context]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {missing}",
        )

    user_id = user.user.id
    campaign_row = {
        "organizer_id": user_id,
        "title": context["title"],
        "location": context["location"],
        "address": context["address"],
        "date": context["date"],
        "start_time": context["start_time"],
        "end_time": context["end_time"],
        "status": "published",
    }
    for optional in ("max_volunteers", "target_flyers", "tags", "food_pantry_id",
                     "latitude", "longitude"):
        if optional in context:
            campaign_row[optional] = context[optional]

    try:
        result = supabase.table("campaigns").insert(campaign_row).execute()
        campaign = result.data[0]
    except Exception as exc:
        logger.error("Failed to create campaign: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create campaign")

    campaign_id = campaign["id"]
    award_points(supabase, user_id, "organize", 50, campaign_id)

    # Store campaign_id in session context
    _merge_context(supabase, session_id, context, "campaign_id", campaign_id)

    return {
        "campaign_id": campaign_id,
        "title": campaign.get("title", context["title"]),
        "date": context["date"],
    }


@router.post("/session/{session_id}/generate-flyer", status_code=201)
def generate_flyer_endpoint(
    body: GenerateFlyerRequest = GenerateFlyerRequest(),
    session_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Generate a flyer for the campaign created in this session."""
    session = _fetch_session(supabase, session_id)
    _verify_ownership(session, user.user.id)

    context = session.get("context", {})
    campaign_id = context.get("campaign_id")
    if not campaign_id:
        raise HTTPException(status_code=400, detail="No campaign created yet in this session")

    # Fetch template
    template_query = supabase.table("flyer_templates").select("id, file_url, thumbnail_url")
    if body.template_id:
        template_query = template_query.eq("id", body.template_id)
    else:
        template_query = template_query.eq("is_active", True)
    template_result = template_query.limit(1).execute()

    templates = template_result.data or []
    if not templates:
        raise HTTPException(status_code=404, detail="No flyer template found")

    template = templates[0]

    # Insert campaign flyer record
    supabase.table("campaign_flyers").insert({
        "campaign_id": campaign_id,
        "template_id": template["id"],
        "custom_fields": {},
    }).execute()

    flyer_url = template.get("file_url", "")
    thumbnail_url = template.get("thumbnail_url", "")

    return {"flyer_url": flyer_url, "thumbnail_url": thumbnail_url}


def _get_agent_executor():
    """Lazy import and build of agent executor. Separate function for testability."""
    from agents.campaign_agent import build_agent_executor
    return build_agent_executor()


def _get_format_history():
    """Lazy import of format_history. Separate function for testability."""
    from agents.campaign_agent import format_history
    return format_history
