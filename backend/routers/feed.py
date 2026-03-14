"""Feed & discovery endpoints."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from auth import get_current_user
from supabase_client import get_supabase_client
from services.rewards import score_campaign, haversine_km

logger = logging.getLogger(__name__)

router = APIRouter()


def _escape_ilike(value: str) -> str:
    """Escape PostgreSQL ILIKE wildcard characters in user input."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/feed")
def get_feed(
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Personalized ranked event feed. Auth required."""
    campaigns_result = (
        supabase.table("campaigns")
        .select("*")
        .eq("status", "published")
        .execute()
    )
    campaigns = campaigns_result.data or []

    user_tags: list[str] = []
    viewed_ids: set[str] = set()

    scored = [
        {**c, "_score": score_campaign(c, lat, lng, user_tags, viewed_ids)}
        for c in campaigns
    ]
    scored.sort(key=lambda c: c["_score"], reverse=True)

    total = len(scored)
    start = (page - 1) * limit
    page_items = scored[start : start + limit]

    data = [{k: v for k, v in item.items() if k != "_score"} for item in page_items]

    return {
        "success": True,
        "data": data,
        "meta": {"total": total, "page": page, "limit": limit},
    }


@router.get("/feed/trending")
def get_trending(
    supabase=Depends(get_supabase_client),
):
    """Trending events (most signups in last 48h). Public."""
    campaigns_result = (
        supabase.table("campaigns")
        .select("*")
        .eq("status", "published")
        .execute()
    )
    campaigns = campaigns_result.data or []

    if not campaigns:
        return {"success": True, "data": []}

    campaign_ids = [c["id"] for c in campaigns]

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    signups_result = (
        supabase.table("signups")
        .select("campaign_id")
        .in_("campaign_id", campaign_ids)
        .gte("joined_at", cutoff)
        .execute()
    )
    signups = signups_result.data or []

    signup_counts: dict[str, int] = {}
    for s in signups:
        cid = s["campaign_id"]
        signup_counts[cid] = signup_counts.get(cid, 0) + 1

    campaigns_with_count = [
        {**c, "recent_signups": signup_counts.get(c["id"], 0)}
        for c in campaigns
    ]
    campaigns_with_count.sort(key=lambda c: c["recent_signups"], reverse=True)

    return {"success": True, "data": campaigns_with_count[:10]}


@router.get("/feed/nearby")
def get_nearby(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=10.0, ge=0.1),
    supabase=Depends(get_supabase_client),
):
    """Events within radius. Public."""
    campaigns_result = (
        supabase.table("campaigns")
        .select("*")
        .eq("status", "published")
        .execute()
    )
    campaigns = campaigns_result.data or []

    nearby = [
        c
        for c in campaigns
        if c.get("latitude") is not None
        and c.get("longitude") is not None
        and haversine_km(lat, lng, c["latitude"], c["longitude"]) <= radius_km
    ]

    return {"success": True, "data": nearby}


@router.get("/campaigns/search")
def search_campaigns(
    q: str | None = None,
    tags: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    supabase=Depends(get_supabase_client),
):
    """Search campaigns. Public."""
    query = supabase.table("campaigns").select("*").eq("status", "published")

    if q:
        query = query.ilike("title", f"%{_escape_ilike(q)}%")

    if tags:
        tag_list = [t.strip() for t in tags.split(",")]
        query = query.contains("tags", tag_list)

    if date_from:
        query = query.gte("date", date_from)

    if date_to:
        query = query.lte("date", date_to)

    result = query.execute()

    return {"success": True, "data": result.data or []}
