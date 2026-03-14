"""Leaderboard & rewards endpoints."""

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query

from auth import get_current_user
from supabase_client import get_supabase_client
from services.rewards import get_level, haversine_km

logger = logging.getLogger(__name__)

router = APIRouter()

PeriodType = Literal["all_time", "monthly", "weekly"]
ScopeType = Literal["global"]


def _period_cutoff(period: PeriodType) -> str | None:
    """Return ISO cutoff timestamp for a period filter, or None for all_time."""
    now = datetime.now(timezone.utc)
    if period == "weekly":
        return (now - timedelta(days=7)).isoformat()
    if period == "monthly":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    return None


def _build_leaderboard(supabase, period: PeriodType, user_ids_filter: set[str] | None = None) -> list[dict]:
    """Build ranked leaderboard from user_points rows."""
    query = supabase.table("user_points").select("user_id, points")
    cutoff = _period_cutoff(period)
    if cutoff:
        query = query.gte("awarded_at", cutoff)
    pts_rows = query.execute().data or []

    totals: dict[str, int] = defaultdict(int)
    for row in pts_rows:
        uid = row["user_id"]
        if user_ids_filter is not None and uid not in user_ids_filter:
            continue
        totals[uid] += row["points"]

    if not totals:
        return []

    sorted_users = sorted(totals.items(), key=lambda x: x[1], reverse=True)
    user_ids = [uid for uid, _ in sorted_users]

    name_map = {
        u["id"]: u["name"]
        for u in (supabase.table("users").select("id, name").in_("id", user_ids).execute().data or [])
    }

    badge_counts: dict[str, int] = defaultdict(int)
    for b in (supabase.table("user_badges").select("user_id, badge_slug").in_("user_id", user_ids).execute().data or []):
        badge_counts[b["user_id"]] += 1

    return [
        {
            "rank": rank,
            "user": {"id": uid, "name": name_map.get(uid, "Unknown")},
            "total_points": total,
            "level": get_level(total),
            "badge_count": badge_counts.get(uid, 0),
        }
        for rank, (uid, total) in enumerate(sorted_users, start=1)
    ]


@router.get("/leaderboard")
def get_leaderboard(
    scope: ScopeType = Query(default="global"),
    period: PeriodType = Query(default="all_time"),
    supabase=Depends(get_supabase_client),
):
    """Global leaderboard. Public."""
    entries = _build_leaderboard(supabase, period)
    return {"success": True, "data": entries}


@router.get("/leaderboard/nearby")
def get_leaderboard_nearby(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=10.0, ge=0.1),
    period: PeriodType = Query(default="all_time"),
    supabase=Depends(get_supabase_client),
):
    """Nearby leaderboard — users who participated in campaigns within radius. Public."""
    campaigns_result = (
        supabase.table("campaigns")
        .select("id, latitude, longitude")
        .neq("latitude", "null")
        .neq("longitude", "null")
        .execute()
    )
    campaigns = campaigns_result.data or []

    nearby_ids = [
        c["id"]
        for c in campaigns
        if c.get("latitude") is not None
        and c.get("longitude") is not None
        and haversine_km(lat, lng, c["latitude"], c["longitude"]) <= radius_km
    ]

    if not nearby_ids:
        return {"success": True, "data": []}

    signups_result = (
        supabase.table("signups")
        .select("user_id")
        .in_("campaign_id", nearby_ids)
        .execute()
    )
    user_ids = {s["user_id"] for s in (signups_result.data or [])}

    if not user_ids:
        return {"success": True, "data": []}

    entries = _build_leaderboard(supabase, period, user_ids_filter=user_ids)
    return {"success": True, "data": entries}


@router.get("/me/points")
def get_my_points(
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Get current user's points and transaction history. Auth required."""
    user_id = user.user.id

    transactions = (
        supabase.table("user_points")
        .select("action, points, campaign_id, awarded_at")
        .eq("user_id", user_id)
        .order("awarded_at", desc=True)
        .execute()
        .data or []
    )
    total = sum(t["points"] for t in transactions)

    return {
        "success": True,
        "data": {"total": total, "transactions": transactions},
    }


@router.get("/me/badges")
def get_my_badges(
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Get current user's badges. Auth required."""
    user_id = user.user.id

    result = (
        supabase.table("user_badges")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    return {"success": True, "data": result.data or []}


@router.get("/me/level")
def get_my_level(
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Get current user's level. Auth required."""
    user_id = user.user.id

    transactions = (
        supabase.table("user_points")
        .select("points")
        .eq("user_id", user_id)
        .order("awarded_at", desc=True)
        .execute()
        .data or []
    )
    total = sum(t["points"] for t in transactions)

    return {"success": True, "data": get_level(total)}
