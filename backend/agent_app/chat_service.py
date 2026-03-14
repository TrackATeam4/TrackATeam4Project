from __future__ import annotations

from datetime import UTC, date, datetime
from threading import Lock
from typing import Any, Dict, List, Optional
from uuid import uuid4

VALID_CONTEXT_FIELDS = {
    "title",
    "location",
    "address",
    "latitude",
    "longitude",
    "date",
    "start_time",
    "end_time",
    "max_volunteers",
    "target_flyers",
    "tags",
    "food_pantry_id",
}

REQUIRED_FIELDS = ["title", "location", "address", "date", "start_time", "end_time"]


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def default_context() -> Dict[str, Any]:
    return {
        "title": None,
        "location": None,
        "address": None,
        "latitude": None,
        "longitude": None,
        "date": None,
        "start_time": None,
        "end_time": None,
        "max_volunteers": None,
        "target_flyers": None,
        "tags": [],
        "food_pantry_id": None,
    }


class ChatStore:
    """In-memory chat/session store for the API's session lifecycle."""

    def __init__(self) -> None:
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._lock = Lock()

    def create_session(self, user_id: str) -> Dict[str, Any]:
        with self._lock:
            session_id = str(uuid4())
            session = {
                "session_id": session_id,
                "user_id": user_id,
                "status": "active",
                "context": default_context(),
                "messages": [],
                "campaign": None,
                "created_at": _utc_now_iso(),
                "updated_at": _utc_now_iso(),
            }
            self._sessions[session_id] = session
            return session

    def get_session(self, session_id: str, user_id: str) -> Dict[str, Any]:
        session = self._sessions.get(session_id)
        if not session or session["user_id"] != user_id:
            raise KeyError("Session not found")
        return session

    def append_message(self, session: Dict[str, Any], role: str, content: str) -> None:
        with self._lock:
            session["messages"].append({"role": role, "content": content})
            session["updated_at"] = _utc_now_iso()

    def save_context_field(self, session: Dict[str, Any], field: str, value: Any) -> Dict[str, Any]:
        if field not in VALID_CONTEXT_FIELDS:
            raise ValueError(f"Invalid field '{field}'")

        normalized = value
        if field in {"max_volunteers", "target_flyers"} and value is not None:
            normalized = int(value)
        elif field == "tags" and value is not None:
            if isinstance(value, str):
                normalized = [tag.strip() for tag in value.split(",") if tag.strip()]
            elif not isinstance(value, list):
                raise ValueError("tags must be a list or comma-separated string")

        with self._lock:
            session["context"][field] = normalized
            session["updated_at"] = _utc_now_iso()
            return session["context"]

    def check_conflicts(self, session: Dict[str, Any]) -> Dict[str, Any]:
        context = session["context"]
        location = (context.get("location") or "").lower()
        event_date = context.get("date")

        has_conflict = bool(event_date and "hyde park" in location)
        conflicts = []
        if has_conflict:
            conflicts = [
                {
                    "id": str(uuid4()),
                    "title": "Hyde Park Morning Run",
                    "date": event_date,
                    "start_time": "09:00",
                    "distance_km": 0.3,
                }
            ]

        return {"has_conflict": has_conflict, "conflicts": conflicts}

    def suggest_pantries(self, session: Dict[str, Any]) -> List[Dict[str, Any]]:
        location = (session["context"].get("location") or "").lower()
        if not location:
            return []

        if "hyde park" in location:
            return [
                {
                    "id": str(uuid4()),
                    "name": "Hyde Park Community Pantry",
                    "distance_km": 0.8,
                    "services": ["produce", "canned_goods", "diapers"],
                }
            ]

        return [
            {
                "id": str(uuid4()),
                "name": "Neighborhood Food Pantry",
                "distance_km": 1.4,
                "services": ["produce", "canned_goods"],
            }
        ]

    def create_campaign(self, session: Dict[str, Any]) -> Dict[str, Any]:
        context = session["context"]
        missing = [field for field in REQUIRED_FIELDS if not context.get(field)]
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(missing)}")

        with self._lock:
            campaign = {
                "campaign_id": str(uuid4()),
                "title": context["title"],
                "date": context["date"],
                "created_at": _utc_now_iso(),
            }
            session["campaign"] = campaign
            session["updated_at"] = _utc_now_iso()
            return campaign

    def generate_flyer(self, session: Dict[str, Any], template_id: Optional[str] = None) -> Dict[str, str]:
        campaign = session.get("campaign")
        if not campaign:
            raise ValueError("Campaign must be created before generating a flyer")

        campaign_id = campaign["campaign_id"]
        template_suffix = template_id or "default-template"
        base = f"https://storage.supabase.co/mock/{campaign_id}/{template_suffix}"

        return {
            "flyer_url": f"{base}/flyer.pdf",
            "thumbnail_url": f"{base}/thumb.png",
        }


def is_ready_to_create(context: Dict[str, Any]) -> bool:
    return all(context.get(field) for field in REQUIRED_FIELDS)


def next_saturday_iso(today: Optional[date] = None) -> str:
    current = today or date.today()
    days_until = (5 - current.weekday()) % 7
    days_until = 7 if days_until == 0 else days_until
    return current.fromordinal(current.toordinal() + days_until).isoformat()


chat_store = ChatStore()

