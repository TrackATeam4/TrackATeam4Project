"""Geocoding service using OpenStreetMap Nominatim — free, no API key required."""

from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_HEADERS = {"User-Agent": "TrackA-Lemontree/1.0 (contact@lemontree.org)"}
_TIMEOUT = 8.0


def geocode_address(address: str) -> Optional[tuple[float, float]]:
    """Return (latitude, longitude) for an address string, or None if not found."""
    results = search_addresses(address, limit=1)
    if not results:
        return None
    return results[0]["latitude"], results[0]["longitude"]


def search_addresses(address: str, limit: int = 5) -> list[dict]:
    """Return up to `limit` candidate results for an address string.

    Each result has: display_name, latitude, longitude.
    """
    if not address or not address.strip():
        return []

    try:
        response = httpx.get(
            _NOMINATIM_URL,
            params={"q": address.strip(), "format": "json", "limit": limit, "addressdetails": 0, "countrycodes": "us"},
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        raw = response.json()
        return [
            {
                "display_name": item["display_name"],
                "latitude": float(item["lat"]),
                "longitude": float(item["lon"]),
            }
            for item in raw
        ]
    except Exception as exc:
        logger.warning("Geocoding search failed for %r: %s", address, exc)
        return []
