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
    if not address or not address.strip():
        return None

    try:
        response = httpx.get(
            _NOMINATIM_URL,
            params={"q": address.strip(), "format": "json", "limit": 1},
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        results = response.json()
        if not results:
            return None
        top = results[0]
        return float(top["lat"]), float(top["lon"])
    except Exception as exc:
        logger.warning("Geocoding failed for %r: %s", address, exc)
        return None
