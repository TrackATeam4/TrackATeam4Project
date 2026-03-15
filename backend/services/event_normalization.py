"""Normalize chat-collected event fields into canonical backend values."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

import dateparser

_DATE_FIELDS = {"date"}
_TIME_FIELDS = {"start_time", "end_time"}
_INT_FIELDS = {"max_volunteers", "target_flyers"}
_FLOAT_FIELDS = {"latitude", "longitude"}
_STRING_FIELDS = {
    "title",
    "location",
    "address",
    "food_pantry_id",
    "campaign_id",
    "flyer_url",
    "thumbnail_url",
}


def _strip_string(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _parse_flexible_date(raw: Any) -> str:
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw.strftime("%Y-%m-%d")
    if isinstance(raw, datetime):
        return raw.date().strftime("%Y-%m-%d")

    text = _strip_string(raw)
    if not text:
        return ""

    lowered = text.lower()
    today = date.today()
    # Lightweight handling for common relative words used in chat.
    if lowered == "today":
        return today.strftime("%Y-%m-%d")
    if lowered == "tomorrow":
        return (today + timedelta(days=1)).strftime("%Y-%m-%d")
    if lowered == "yesterday":
        return (today - timedelta(days=1)).strftime("%Y-%m-%d")

    parsed = dateparser.parse(
        text,
        settings={
            "PREFER_DATES_FROM": "future",
            "RETURN_AS_TIMEZONE_AWARE": False,
        },
    )
    if not parsed:
        raise ValueError(f"Could not parse date from '{text}'.")
    return parsed.strftime("%Y-%m-%d")


def _parse_flexible_time(raw: Any) -> str:
    if isinstance(raw, datetime):
        return raw.strftime("%H:%M")

    text = _strip_string(raw)
    if not text:
        return ""

    lowered = text.lower()
    if lowered == "noon":
        return "12:00"
    if lowered == "midnight":
        return "00:00"

    # Make common conversational phrases easier for the parser.
    replacements = {
        " in the morning": " am",
        " this morning": " am",
        " in the afternoon": " pm",
        " this afternoon": " pm",
        " in the evening": " pm",
        " this evening": " pm",
        " at night": " pm",
        " tonight": " pm",
    }
    normalized_for_parse = lowered
    for src, dst in replacements.items():
        normalized_for_parse = normalized_for_parse.replace(src, dst)

    compact_hour = re.fullmatch(r"(\d{1,2})", normalized_for_parse)
    if compact_hour:
        hour = int(compact_hour.group(1))
        if 0 <= hour <= 23:
            return f"{hour:02d}:00"

    parsed = dateparser.parse(
        normalized_for_parse,
        settings={
            "PREFER_DATES_FROM": "future",
            "RETURN_AS_TIMEZONE_AWARE": False,
            "PREFER_DAY_OF_MONTH": "first",
        },
    )
    if not parsed:
        raise ValueError(f"Could not parse time from '{text}'.")
    return parsed.strftime("%H:%M")


def _parse_int_field(field: str, raw: Any) -> int | None:
    if raw is None:
        return None
    if isinstance(raw, str) and raw.strip() == "":
        return None
    try:
        value = int(raw)
    except Exception as exc:
        raise ValueError(f"Field '{field}' must be an integer.") from exc
    if value < 1:
        raise ValueError(f"Field '{field}' must be at least 1.")
    return value


def _parse_float_field(field: str, raw: Any) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, str) and raw.strip() == "":
        return None
    try:
        value = float(raw)
    except Exception as exc:
        raise ValueError(f"Field '{field}' must be numeric.") from exc

    if field == "latitude" and not (-90.0 <= value <= 90.0):
        raise ValueError("Latitude must be between -90 and 90.")
    if field == "longitude" and not (-180.0 <= value <= 180.0):
        raise ValueError("Longitude must be between -180 and 180.")
    return value


def _normalize_tags(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(tag).strip() for tag in raw if str(tag).strip()]
    text = _strip_string(raw)
    if not text:
        return []
    return [chunk.strip() for chunk in re.split(r"[,;]", text) if chunk.strip()]


def normalize_context_field(field: str, value: Any) -> Any:
    """Normalize a context field into the storage format used by campaign creation."""
    if field in _STRING_FIELDS:
        return _strip_string(value)

    if field in _DATE_FIELDS:
        return _parse_flexible_date(value)

    if field in _TIME_FIELDS:
        return _parse_flexible_time(value)

    if field in _INT_FIELDS:
        return _parse_int_field(field, value)

    if field in _FLOAT_FIELDS:
        return _parse_float_field(field, value)

    if field == "tags":
        return _normalize_tags(value)

    if isinstance(value, str):
        return value.strip()
    return value
