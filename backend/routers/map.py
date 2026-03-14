"""Lightweight map pin endpoints for the Discover map."""

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query

from services.rewards import haversine_km
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/map", tags=["map"])

CampaignStatus = Literal["draft", "published", "completed", "cancelled"]


# ── GET /map/campaigns ────────────────────────────────────────────────────────


@router.get("/campaigns")
def get_campaign_pins(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=20, ge=0.1, le=200),
    status: CampaignStatus = Query(default="published"),
    supabase=Depends(get_supabase_client),
):
    """Return lightweight campaign map pins within radius_km of lat/lng. Public."""
    result = (
        supabase.table("campaigns")
        .select("id, title, latitude, longitude, date, max_volunteers, status")
        .eq("status", status)
        .not_.is_("latitude", "null")
        .not_.is_("longitude", "null")
        .execute()
    )

    campaigns = result.data or []

    # Filter by radius and attach signup counts
    campaign_ids = [c["id"] for c in campaigns]
    signup_counts: dict[str, int] = {}
    if campaign_ids:
        signups_result = (
            supabase.table("signups")
            .select("campaign_id")
            .in_("campaign_id", campaign_ids)
            .neq("status", "cancelled")
            .execute()
        )
        for row in signups_result.data or []:
            cid = row["campaign_id"]
            signup_counts[cid] = signup_counts.get(cid, 0) + 1

    pins = []
    for c in campaigns:
        c_lat = c.get("latitude")
        c_lng = c.get("longitude")
        if c_lat is None or c_lng is None:
            continue
        if haversine_km(lat, lng, c_lat, c_lng) > radius_km:
            continue
        pins.append({
            "id": c["id"],
            "title": c["title"],
            "latitude": c_lat,
            "longitude": c_lng,
            "date": c["date"],
            "signup_count": signup_counts.get(c["id"], 0),
            "max_volunteers": c.get("max_volunteers"),
            "status": c["status"],
        })

    return {"success": True, "data": pins}


# ── GET /map/food-pantries ────────────────────────────────────────────────────


@router.get("/food-pantries")
def get_pantry_pins(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=20, ge=0.1, le=200),
    supabase=Depends(get_supabase_client),
):
    """Return food pantry map pins within radius_km of lat/lng. Public."""
    result = (
        supabase.table("food_pantries")
        .select("id, name, latitude, longitude, address")
        .execute()
    )

    pins = []
    for p in result.data or []:
        p_lat = p.get("latitude")
        p_lng = p.get("longitude")
        if p_lat is None or p_lng is None:
            continue
        if haversine_km(lat, lng, p_lat, p_lng) > radius_km:
            continue
        pins.append({
            "id": p["id"],
            "name": p["name"],
            "latitude": p_lat,
            "longitude": p_lng,
            "address": p.get("address"),
        })

    return {"success": True, "data": pins}
