"""Rewards service: points, badges, levels, scoring utilities."""

from datetime import date, datetime, timezone
from math import radians, sin, cos, sqrt, atan2

LEVELS = [
    (0, 1, "Seedling"),
    (50, 2, "Sprout"),
    (150, 3, "Bloom"),
    (350, 4, "Branch"),
    (700, 5, "Squeeze Champion"),
]


def get_level(total_points: int) -> dict:
    """Determine user level from total points."""
    current = LEVELS[0]
    for min_pts, level, name in LEVELS:
        if total_points >= min_pts:
            current = (min_pts, level, name)

    next_idx = current[1]  # level number is 1-indexed, matches next LEVELS index
    if next_idx < len(LEVELS):
        next_min = LEVELS[next_idx][0]
        denom = next_min - current[0]
        progress = (total_points - current[0]) / denom if denom > 0 else 1.0
    else:
        progress = 1.0

    return {
        "level": current[1],
        "name": current[2],
        "progress_pct": round(min(progress, 1.0) * 100),
    }


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points in km."""
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def score_campaign(
    campaign: dict,
    user_lat: float | None,
    user_lng: float | None,
    user_tags: list[str],
    viewed_ids: set[str],
) -> float:
    """Compute recommendation score for a campaign (0.0 to ~1.2)."""
    # 1. Proximity (40%)
    if (
        user_lat is not None
        and user_lng is not None
        and campaign.get("latitude")
        and campaign.get("longitude")
    ):
        dist = haversine_km(user_lat, user_lng, campaign["latitude"], campaign["longitude"])
        proximity = max(0.0, 1.0 - dist / 15.0) * 0.40
    else:
        proximity = 0.20

    # 2. Interest match (25%)
    c_tags = campaign.get("tags") or []
    if c_tags and user_tags:
        overlap = len(set(c_tags) & set(user_tags))
        interest = (overlap / len(c_tags)) * 0.25
    else:
        interest = 0.0

    # 3. Urgency (20%)
    campaign_date_raw = campaign["date"]
    campaign_date = (
        date.fromisoformat(campaign_date_raw)
        if isinstance(campaign_date_raw, str)
        else campaign_date_raw
    )
    days_away = (campaign_date - date.today()).days
    if days_away < 0:
        urgency = 0.0
    elif days_away <= 3:
        urgency = 1.0 * 0.20
    else:
        urgency = max(0.0, 1.0 - days_away / 14.0) * 0.20

    # 4. Social proof (10%)
    max_v = campaign.get("max_volunteers")
    signup_count = campaign.get("signup_count", 0) or 0
    if max_v:
        fill_rate = min(1.0, signup_count / max_v)
    else:
        fill_rate = 0.5
    social = fill_rate * 0.10

    # 5. Novelty (5%)
    novelty = 0.0 if campaign["id"] in viewed_ids else 0.05

    # Promotion boost +20%
    promoted_until = campaign.get("promoted_until")
    boost = 0.0
    if promoted_until:
        if isinstance(promoted_until, str):
            pu = datetime.fromisoformat(promoted_until.replace("Z", "+00:00"))
        else:
            pu = promoted_until
        if pu > datetime.now(timezone.utc):
            boost = 0.20

    return proximity + interest + urgency + social + novelty + boost


def award_points(supabase, user_id: str, action: str, points: int, campaign_id: str | None = None) -> dict:
    """Insert a points record for a user. Synchronous."""
    row = {
        "user_id": user_id,
        "action": action,
        "points": points,
    }
    if campaign_id:
        row["campaign_id"] = campaign_id

    result = supabase.table("user_points").insert(row).execute()
    return result.data


def check_and_award_badges(supabase, user_id: str) -> list[str]:
    """Check badge criteria and award any earned badges. Returns list of newly awarded slugs."""
    awarded = []

    # Badge: impact_100 -- total flyers distributed >= 100
    reports_result = (
        supabase.table("impact_reports")
        .select("flyers_distributed")
        .eq("submitted_by", user_id)
        .execute()
    )
    total_flyers = sum(r.get("flyers_distributed", 0) for r in (reports_result.data or []))

    if total_flyers >= 100:
        existing = (
            supabase.table("user_badges")
            .select("id")
            .eq("user_id", user_id)
            .eq("badge_slug", "impact_100")
            .execute()
        )
        if not existing.data:
            supabase.table("user_badges").insert({
                "user_id": user_id,
                "badge_slug": "impact_100",
            }).execute()
            awarded.append("impact_100")

    return awarded
