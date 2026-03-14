from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, Generator, List, Optional

from langchain_core.tools import tool

import agent_app.chat_service as chat_service
from agent_app.supabase_utils import get_supabase_client_optional


def _extract_user_id_from_token(token: str) -> str:
    client = get_supabase_client_optional()
    if client is None:
        return "anonymous"

    try:
        user_response = client.auth.get_user(token)
        user_obj = getattr(user_response, "user", None)
        user_id = getattr(user_obj, "id", None)
        if user_id:
            return str(user_id)
    except Exception:
        pass
    return "anonymous"


def _get_session(session_id: str, token: str) -> Dict[str, Any]:
    user_id = _extract_user_id_from_token(token)
    return chat_service.chat_store.get_session(session_id=session_id, user_id=user_id)


@tool
def save_event_field(session_id: str, field: str, value: Any, token: str) -> Dict[str, Any]:
    """Save a collected event field (title, location, date, etc.) to the session."""
    session = _get_session(session_id, token)
    context = chat_service.chat_store.save_context_field(session, field, value)
    return {"success": True, "data": {"context": context}}


@tool
def check_conflicts(session_id: str, token: str) -> Dict[str, Any]:
    """Check if there are scheduling conflicts for the current session's location and date."""
    session = _get_session(session_id, token)
    return {"success": True, "data": chat_service.chat_store.check_conflicts(session)}


@tool
def suggest_nearby_pantries(session_id: str, token: str) -> Dict[str, Any]:
    """Find nearby food pantries to optionally link to the event."""
    session = _get_session(session_id, token)
    pantries = chat_service.chat_store.suggest_pantries(session)
    return {"success": True, "data": {"pantries": pantries}}


@tool
def create_campaign(session_id: str, token: str) -> Dict[str, Any]:
    """Create the event campaign from collected session context when required fields are present."""
    session = _get_session(session_id, token)
    campaign = chat_service.chat_store.create_campaign(session)
    return {"success": True, "data": campaign}


@tool
def generate_flyer(session_id: str, token: str, template_id: Optional[str] = None) -> Dict[str, Any]:
    """Generate a flyer for the created campaign."""
    session = _get_session(session_id, token)
    flyer = chat_service.chat_store.generate_flyer(session, template_id=template_id)
    return {"success": True, "data": flyer}


def _extract_fields_from_message(message: str) -> Dict[str, Any]:
    extracted: Dict[str, Any] = {}
    lowered = message.lower()

    if "flyering" in lowered and "title" not in extracted:
        extracted["title"] = "Flyering Event"

    location_match = re.search(r"\bin\s+([A-Za-z\s]+?)(?:\s+(?:on|next|at|for)\b|$)", message, re.IGNORECASE)
    if location_match:
        extracted["location"] = location_match.group(1).strip(" ,.")

    if "next saturday" in lowered:
        extracted["date"] = chat_service.next_saturday_iso(date.today())

    volunteers_match = re.search(r"(\d+)\s+volunteers?", lowered)
    if volunteers_match:
        extracted["max_volunteers"] = int(volunteers_match.group(1))

    flyers_match = re.search(r"(\d+)\s+flyers?", lowered)
    if flyers_match:
        extracted["target_flyers"] = int(flyers_match.group(1))

    return extracted


def _next_question(context: Dict[str, Any]) -> str:
    missing = [field for field in chat_service.REQUIRED_FIELDS if not context.get(field)]
    if not missing:
        return "I have all required details. Should I create the campaign now?"

    prompts = {
        "title": "What should the event title be?",
        "location": "Which neighborhood is the event in?",
        "address": "What is the exact street address?",
        "date": "What date should I schedule the event for?",
        "start_time": "What time should the event start?",
        "end_time": "What time should the event end?",
    }
    return prompts.get(missing[0], "Can you share the next missing detail?")


def run_turn(session_id: str, user_message: str, chat_history: List[Dict[str, str]], token: str) -> Dict[str, Any]:
    """Process one chat turn and return reply/context/action payload."""
    del chat_history  # The in-memory store is already source-of-truth for history.

    extracted = _extract_fields_from_message(user_message)
    for field, value in extracted.items():
        save_event_field.invoke({"session_id": session_id, "field": field, "value": value, "token": token})

    session = _get_session(session_id, token)
    context = session["context"]
    action: Optional[Dict[str, Any]] = None

    if chat_service.is_ready_to_create(context):
        conflicts_result = check_conflicts.invoke({"session_id": session_id, "token": token})
        conflict_data = conflicts_result["data"]

        if conflict_data.get("has_conflict") and "proceed" not in user_message.lower():
            first = conflict_data["conflicts"][0]
            reply = (
                f"I found a nearby conflict: {first['title']} at {first['start_time']} on {first['date']} "
                f"({first['distance_km']} km away). Do you want to proceed anyway?"
            )
            return {"reply": reply, "context": context, "action": None}

        campaign = create_campaign.invoke({"session_id": session_id, "token": token})["data"]
        flyer = generate_flyer.invoke({"session_id": session_id, "token": token})["data"]
        action = {
            "type": "campaign_created",
            "campaign_id": campaign["campaign_id"],
            "flyer_url": flyer["flyer_url"],
        }
        reply = "Your event is live! I've created the campaign and your flyer is ready to download."
        return {"reply": reply, "context": context, "action": action}

    location = context.get("location")
    if location and not context.get("food_pantry_id"):
        pantries = suggest_nearby_pantries.invoke({"session_id": session_id, "token": token})["data"]["pantries"]
        if pantries:
            pantry = pantries[0]
            reply = (
                f"Got it. I saved {location}. There's a food pantry {pantry['distance_km']}km away "
                f"({pantry['name']}). Want to link your event to them?"
            )
            return {"reply": reply, "context": context, "action": None}

    reply = _next_question(context)
    return {"reply": reply, "context": context, "action": action}


def stream_turn(session_id: str, user_message: str, chat_history: List[Dict[str, str]], token: str) -> Generator[str, None, None]:
    """Yield assistant response chunks for SSE."""
    result = run_turn(session_id=session_id, user_message=user_message, chat_history=chat_history, token=token)
    reply = result["reply"]
    words = reply.split(" ")
    for index, word in enumerate(words):
        suffix = " " if index < len(words) - 1 else ""
        yield word + suffix
