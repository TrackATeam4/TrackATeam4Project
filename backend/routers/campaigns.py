"""Volunteer Campaign CRUD and signup endpoints."""

import logging
from datetime import date, datetime, time, timezone
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query
from pydantic import BaseModel, Field

from auth import get_current_user
from services.email_service import send_reminder
from services.geocoding import geocode_address, search_addresses
from services.rewards import award_points
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

_UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
_TIME_PATTERN = r"^\d{2}:\d{2}$"

CampaignStatus = Literal["draft", "published", "completed", "cancelled"]

ATTENDANCE_POINTS = 20


class CampaignCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    location: str = Field(min_length=1, max_length=255)
    address: str = Field(min_length=1, max_length=500)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    start_time: str = Field(pattern=_TIME_PATTERN)
    end_time: str = Field(pattern=_TIME_PATTERN)
    max_volunteers: Optional[int] = Field(default=None, ge=1)
    target_flyers: int = Field(ge=0)
    flyer_template_id: Optional[str] = Field(default=None, pattern=_UUID_PATTERN)
    food_pantry_id: Optional[str] = Field(default=None, pattern=_UUID_PATTERN)
    tags: Annotated[list[str], Field(max_length=20)] = []


class CheckinRequest(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None


class PublicRsvpRequest(BaseModel):
    email: str
    name: Optional[str] = None


class CampaignUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    location: Optional[str] = Field(default=None, min_length=1, max_length=255)
    address: Optional[str] = Field(default=None, min_length=1, max_length=500)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    start_time: Optional[str] = Field(default=None, pattern=_TIME_PATTERN)
    end_time: Optional[str] = Field(default=None, pattern=_TIME_PATTERN)
    max_volunteers: Optional[int] = Field(default=None, ge=1)
    target_flyers: Optional[int] = Field(default=None, ge=0)
    flyer_template_id: Optional[str] = Field(default=None, pattern=_UUID_PATTERN)
    food_pantry_id: Optional[str] = Field(default=None, pattern=_UUID_PATTERN)
    tags: Optional[list[str]] = Field(default=None, max_length=20)
    status: Optional[CampaignStatus] = None


@router.get("/geocode")
def geocode(address: str = Query(..., min_length=3), limit: int = Query(default=5, ge=1, le=10)):
    """Resolve an address string to candidate results using OpenStreetMap. Public."""
    results = search_addresses(address, limit=limit)
    if not results:
        raise HTTPException(status_code=404, detail="Address not found")
    return {"success": True, "data": results}


import uuid as _uuid


def _find_or_create_user_by_email(supabase, email: str, name: str | None = None) -> str:
    res = supabase.table("users").select("id").eq("email", email).limit(1).execute()
    if res.data:
        return res.data[0]["id"]
    new_id = str(_uuid.uuid4())
    supabase.table("users").insert(
        {"id": new_id, "email": email, "name": name or email.split("@")[0], "role": "volunteer"}
    ).execute()
    return new_id


def _get_campaign_or_404(supabase, campaign_id: str) -> dict:
    result = (
        supabase.table("campaigns").select("*").eq("id", campaign_id).limit(1).execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return rows[0]


# ── POST /campaigns ──────────────────────────────────────────────────────────


@router.post("", status_code=201)
def create_campaign(
    body: CampaignCreate,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Create a new campaign. Auth required."""
    user_id = user.user.id

    # Auto-geocode from address when coordinates are not provided
    latitude = body.latitude
    longitude = body.longitude
    if latitude is None or longitude is None:
        coords = geocode_address(f"{body.address}, {body.location}")
        if coords:
            latitude, longitude = coords
        else:
            logger.warning("Could not geocode address: %s", body.address)

    row = {
        "organizer_id": user_id,
        "title": body.title,
        "description": body.description,
        "location": body.location,
        "address": body.address,
        "latitude": latitude,
        "longitude": longitude,
        "date": body.date,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "max_volunteers": body.max_volunteers,
        "target_flyers": body.target_flyers,
        "flyer_template_id": body.flyer_template_id,
        "food_pantry_id": body.food_pantry_id,
        "tags": body.tags,
        "status": "draft",
    }

    try:
        result = supabase.table("campaigns").insert(row).execute()
    except Exception as exc:
        logger.error("Failed to create campaign for user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to create campaign")

    return {"success": True, "data": result.data[0] if result.data else None}


# ── GET /campaigns ───────────────────────────────────────────────────────────


@router.get("")
def list_campaigns(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    supabase=Depends(get_supabase_client),
):
    """Public paginated list of campaigns."""
    start = (page - 1) * limit
    end = start + limit - 1

    result = (
        supabase.table("campaigns")
        .select("*", count="exact")
        .order("created_at", desc=True)
        .range(start, end)
        .execute()
    )

    total = result.count or 0
    campaigns = result.data or []

    # Attach signup counts
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

    for c in campaigns:
        c["signup_count"] = signup_counts.get(c["id"], 0)

    # Attach like and comment counts
    if campaign_ids:
        likes_result = (
            supabase.table("campaign_likes")
            .select("campaign_id")
            .in_("campaign_id", campaign_ids)
            .execute()
        )
        like_counts: dict[str, int] = {}
        for row in likes_result.data or []:
            cid = row["campaign_id"]
            like_counts[cid] = like_counts.get(cid, 0) + 1

        comments_result = (
            supabase.table("campaign_comments")
            .select("campaign_id")
            .in_("campaign_id", campaign_ids)
            .execute()
        )
        comment_counts: dict[str, int] = {}
        for row in comments_result.data or []:
            cid = row["campaign_id"]
            comment_counts[cid] = comment_counts.get(cid, 0) + 1

        for c in campaigns:
            c["likes"] = like_counts.get(c["id"], 0)
            c["comments"] = comment_counts.get(c["id"], 0)

    return {
        "success": True,
        "data": campaigns,
        "meta": {"total": total, "page": page, "limit": limit},
    }


# ── GET /campaigns/liked ─────────────────────────────────────────────────────


@router.get("/liked")
def get_liked_campaigns(
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Return campaign IDs the current user has liked."""
    user_id = user.user.id
    result = (
        supabase.table("campaign_likes")
        .select("campaign_id")
        .eq("user_id", user_id)
        .execute()
    )
    ids = [row["campaign_id"] for row in (result.data or [])]
    return {"success": True, "data": ids}


# ── POST /campaigns/{id}/like ─────────────────────────────────────────────────


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


@router.post("/{campaign_id}/like")
def toggle_like(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Toggle like on a campaign. Returns {liked, count}."""
    user_id = user.user.id
    _get_campaign_or_404(supabase, campaign_id)

    existing = (
        supabase.table("campaign_likes")
        .select("campaign_id")
        .eq("campaign_id", campaign_id)
        .eq("user_id", user_id)
        .execute()
    )

    if existing.data:
        supabase.table("campaign_likes").delete().eq("campaign_id", campaign_id).eq("user_id", user_id).execute()
        liked = False
    else:
        supabase.table("campaign_likes").insert({"campaign_id": campaign_id, "user_id": user_id}).execute()
        liked = True

    count_result = (
        supabase.table("campaign_likes")
        .select("campaign_id", count="exact")
        .eq("campaign_id", campaign_id)
        .execute()
    )
    count = count_result.count or 0
    return {"success": True, "data": {"liked": liked, "count": count}}


# ── GET /campaigns/{id}/comments ─────────────────────────────────────────────


@router.get("/{campaign_id}/comments")
def get_comments(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    supabase=Depends(get_supabase_client),
):
    """Public list of comments for a campaign."""
    result = (
        supabase.table("campaign_comments")
        .select("id, author_name, body, created_at")
        .eq("campaign_id", campaign_id)
        .order("created_at", desc=False)
        .execute()
    )
    return {"success": True, "data": result.data or []}


# ── POST /campaigns/{id}/comments ────────────────────────────────────────────


@router.post("/{campaign_id}/comments", status_code=201)
def post_comment(
    body: CommentCreate,
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Post a comment on a campaign."""
    user_id = user.user.id
    _get_campaign_or_404(supabase, campaign_id)

    # Resolve display name
    user_row = supabase.table("users").select("name").eq("id", user_id).single().execute()
    author_name = (user_row.data or {}).get("name") or "Volunteer"

    try:
        result = (
            supabase.table("campaign_comments")
            .insert({
                "campaign_id": campaign_id,
                "user_id": user_id,
                "author_name": author_name,
                "body": body.body.strip(),
            })
            .execute()
        )
    except Exception as exc:
        logger.error("Failed to post comment on campaign %s: %s", campaign_id, exc)
        raise HTTPException(status_code=500, detail="Failed to post comment")

    return {"success": True, "data": result.data[0] if result.data else {}}


# ── GET /campaigns/mine ───────────────────────────────────────────────────────


@router.get("/mine")
def get_my_campaigns(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Campaigns the authenticated user created."""
    user_id = user.user.id

    result = (
        supabase.table("campaigns")
        .select("*")
        .eq("organizer_id", user_id)
        .order("created_at", desc=True)
        .range((page - 1) * limit, page * limit - 1)
        .execute()
    )

    return {
        "success": True,
        "data": result.data or [],
        "meta": {"page": page, "limit": limit},
    }


# ── GET /campaigns/joined ─────────────────────────────────────────────────────


@router.get("/joined")
def get_joined_campaigns(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Campaigns the authenticated user signed up for."""
    user_id = user.user.id

    signups_result = (
        supabase.table("signups")
        .select("campaign_id")
        .eq("user_id", user_id)
        .neq("status", "cancelled")
        .execute()
    )
    campaign_ids = [s["campaign_id"] for s in (signups_result.data or [])]

    if not campaign_ids:
        return {"success": True, "data": [], "meta": {"page": page, "limit": limit}}

    result = (
        supabase.table("campaigns")
        .select("*")
        .in_("id", campaign_ids)
        .order("date", desc=False)
        .range((page - 1) * limit, page * limit - 1)
        .execute()
    )

    return {
        "success": True,
        "data": result.data or [],
        "meta": {"page": page, "limit": limit},
    }


# ── POST /campaigns/{id}/signup ──────────────────────────────────────────────


@router.post("/{campaign_id}/signup", status_code=201)
def sign_up_for_campaign(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Volunteer signs up for a campaign. Auth required."""
    user_id = user.user.id
    _get_campaign_or_404(supabase, campaign_id)

    existing_result = (
        supabase.table("signups")
        .select("id, status")
        .eq("campaign_id", campaign_id)
        .eq("user_id", user_id)
        .execute()
    )
    existing_rows = existing_result.data or []

    if existing_rows:
        existing = existing_rows[0]
        if existing["status"] in ("pending", "confirmed"):
            raise HTTPException(
                status_code=409, detail="Already signed up for this campaign"
            )
        try:
            result = (
                supabase.table("signups")
                .update({"status": "pending"})
                .eq("id", existing["id"])
                .execute()
            )
        except Exception as exc:
            logger.error(
                "Failed to re-activate signup for campaign %s: %s", campaign_id, exc
            )
            raise HTTPException(status_code=500, detail="Failed to sign up")
        return {"success": True, "data": result.data[0] if result.data else None}

    try:
        result = (
            supabase.table("signups")
            .insert(
                {
                    "campaign_id": campaign_id,
                    "user_id": user_id,
                    "status": "pending",
                }
            )
            .execute()
        )
    except Exception as exc:
        logger.error(
            "Failed signup for campaign %s user %s: %s", campaign_id, user_id, exc
        )
        raise HTTPException(status_code=500, detail="Failed to sign up")

    return {"success": True, "data": result.data[0] if result.data else None}


# ── DELETE /campaigns/{id}/signup ────────────────────────────────────────────


@router.delete("/{campaign_id}/signup")
def withdraw_signup(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Volunteer withdraws their signup from a campaign. Auth required."""
    user_id = user.user.id
    _get_campaign_or_404(supabase, campaign_id)

    signup_result = (
        supabase.table("signups")
        .select("id, status")
        .eq("campaign_id", campaign_id)
        .eq("user_id", user_id)
        .execute()
    )
    rows = signup_result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Signup not found")

    signup = rows[0]
    if signup["status"] == "cancelled":
        return {"success": True, "data": {"id": signup["id"], "status": "cancelled"}}

    try:
        result = (
            supabase.table("signups")
            .update({"status": "cancelled"})
            .eq("id", signup["id"])
            .execute()
        )
    except Exception as exc:
        logger.error("Failed to cancel signup for campaign %s: %s", campaign_id, exc)
        raise HTTPException(status_code=500, detail="Failed to withdraw signup")

    return {"success": True, "data": result.data[0] if result.data else None}


# ── GET /campaigns/{id}/signups ──────────────────────────────────────────────


@router.get("/{campaign_id}/signups")
def get_campaign_signups(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """List signups for a campaign. Organizer only."""
    user_id = user.user.id
    campaign = _get_campaign_or_404(supabase, campaign_id)

    if campaign["organizer_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Only the organizer can view campaign signups"
        )

    result = (
        supabase.table("signups")
        .select("id, campaign_id, user_id, status, joined_at, task_id")
        .eq("campaign_id", campaign_id)
        .order("joined_at", desc=False)
        .execute()
    )

    return {"success": True, "data": result.data or []}


# ── POST /campaigns/{id}/confirm/{uid} ───────────────────────────────────────


@router.post("/{campaign_id}/confirm/{uid}")
def confirm_attendance(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    uid: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Organizer confirms volunteer attended; this triggers rewards."""
    organizer_id = user.user.id
    campaign = _get_campaign_or_404(supabase, campaign_id)

    if campaign["organizer_id"] != organizer_id:
        raise HTTPException(
            status_code=403, detail="Only the organizer can confirm attendance"
        )

    signup_result = (
        supabase.table("signups")
        .select("id, status, user_id, campaign_id")
        .eq("campaign_id", campaign_id)
        .eq("user_id", uid)
        .execute()
    )
    signup_rows = signup_result.data or []

    if not signup_rows:
        raise HTTPException(status_code=404, detail="Signup not found")

    signup = signup_rows[0]
    if signup["status"] == "cancelled":
        raise HTTPException(
            status_code=400, detail="Cancelled signup cannot be confirmed"
        )

    if signup["status"] == "confirmed":
        return {"success": True, "data": signup}

    try:
        result = (
            supabase.table("signups")
            .update({"status": "confirmed"})
            .eq("id", signup["id"])
            .execute()
        )
        updated = result.data[0] if result.data else signup
        award_points(supabase, uid, "attend", ATTENDANCE_POINTS, campaign_id)
    except Exception as exc:
        logger.error(
            "Failed to confirm attendance for campaign %s user %s: %s",
            campaign_id,
            uid,
            exc,
        )
        raise HTTPException(status_code=500, detail="Failed to confirm attendance")

    return {"success": True, "data": updated}


# ── GET /campaigns/{id} ───────────────────────────────────────────────────────


@router.get("/{campaign_id}")
def get_campaign(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    supabase=Depends(get_supabase_client),
):
    """Get campaign detail. Public."""
    campaign = _get_campaign_or_404(supabase, campaign_id)
    return {"success": True, "data": campaign}


# ── PUT /campaigns/{id} ───────────────────────────────────────────────────────


@router.put("/{campaign_id}")
def update_campaign(
    body: CampaignUpdate,
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Update a campaign. Organizer only."""
    user_id = user.user.id
    campaign = _get_campaign_or_404(supabase, campaign_id)

    if campaign["organizer_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Only the organizer can update this campaign"
        )

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return {"success": True, "data": campaign}

    try:
        result = (
            supabase.table("campaigns").update(updates).eq("id", campaign_id).execute()
        )
    except Exception as exc:
        logger.error("Failed to update campaign %s: %s", campaign_id, exc)
        raise HTTPException(status_code=500, detail="Failed to update campaign")

    return {"success": True, "data": result.data[0] if result.data else None}


# ── DELETE /campaigns/{id} ────────────────────────────────────────────────────


@router.delete("/{campaign_id}", status_code=200)
def delete_campaign(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Cancel/delete a campaign. Organizer only."""
    user_id = user.user.id
    campaign = _get_campaign_or_404(supabase, campaign_id)

    if campaign["organizer_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Only the organizer can delete this campaign"
        )

    try:
        supabase.table("campaigns").update({"status": "cancelled"}).eq(
            "id", campaign_id
        ).execute()
    except Exception as exc:
        logger.error("Failed to cancel campaign %s: %s", campaign_id, exc)
        raise HTTPException(status_code=500, detail="Failed to delete campaign")

    return {"success": True, "data": {"id": campaign_id, "status": "cancelled"}}


# ── POST /campaigns/{id}/remind ───────────────────────────────────────────────


@router.post("/{campaign_id}/remind")
def send_campaign_reminders(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Send reminder emails to all active volunteers for a campaign. Organizer only."""
    organizer_id = user.user.id
    campaign = _get_campaign_or_404(supabase, campaign_id)

    if campaign["organizer_id"] != organizer_id:
        raise HTTPException(status_code=403, detail="Only the organizer can send reminders")

    signups_result = (
        supabase.table("signups")
        .select("user_id")
        .eq("campaign_id", campaign_id)
        .neq("status", "cancelled")
        .execute()
    )

    if not (signups_result.data):
        return {"success": True, "data": {"sent": 0, "message": "No active volunteers to remind"}}

    user_ids = [s["user_id"] for s in signups_result.data]

    users_result = (
        supabase.table("users")
        .select("id, email, name")
        .in_("id", user_ids)
        .execute()
    )
    users_by_id = {u["id"]: u for u in (users_result.data or [])}

    c_date = date.fromisoformat(campaign["date"])
    c_start = time.fromisoformat(campaign["start_time"])
    event_dt = datetime.combine(c_date, c_start).replace(tzinfo=timezone.utc)
    hours_until = max(0, int((event_dt - datetime.now(timezone.utc)).total_seconds() / 3600))

    sent = 0
    for uid in user_ids:
        user_data = users_by_id.get(uid)
        if not user_data or not user_data.get("email"):
            continue
        if send_reminder(
            to_email=user_data["email"],
            volunteer_name=user_data.get("name") or "",
            campaign_title=campaign["title"],
            campaign_address=campaign["address"],
            campaign_date=c_date,
            campaign_start_time=c_start,
            campaign_id=campaign_id,
            hours_until=hours_until,
        ):
            sent += 1

    return {"success": True, "data": {"sent": sent, "total": len(user_ids)}}


# ── POST /campaigns/{id}/checkin ──────────────────────────────────────────────


@router.post("/{campaign_id}/checkin")
def campaign_checkin(
    body: CheckinRequest = CheckinRequest(),
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    authorization: Optional[str] = Header(default=None),
    supabase=Depends(get_supabase_client),
):
    """Self check-in for a campaign. Auth optional — can also supply email."""
    _get_campaign_or_404(supabase, campaign_id)

    user_id: Optional[str] = None

    if authorization and authorization.startswith("Bearer "):
        try:
            user_resp = supabase.auth.get_user(authorization[7:])
            if user_resp and user_resp.user:
                user_id = user_resp.user.id
                u = user_resp.user
                meta = u.user_metadata or {}
                display = meta.get("full_name") or meta.get("name") or (u.email or "").split("@")[0]
                supabase.table("users").upsert(
                    {"id": user_id, "email": u.email, "name": display, "role": "volunteer"},
                    on_conflict="id",
                ).execute()
        except Exception:
            pass

    if not user_id and body.email:
        user_id = _find_or_create_user_by_email(supabase, body.email, body.name)

    if not user_id:
        raise HTTPException(status_code=400, detail="Provide auth token or email to check in")

    existing = (
        supabase.table("signups")
        .select("id, status")
        .eq("campaign_id", campaign_id)
        .eq("user_id", user_id)
        .execute()
    )

    try:
        if existing.data:
            signup = existing.data[0]
            if signup["status"] == "confirmed":
                return {"success": True, "data": signup, "message": "Already checked in"}
            result = (
                supabase.table("signups")
                .update({"status": "confirmed"})
                .eq("id", signup["id"])
                .execute()
            )
            return {"success": True, "data": result.data[0] if result.data else signup}
        result = (
            supabase.table("signups")
            .insert({"campaign_id": campaign_id, "user_id": user_id, "status": "confirmed"})
            .execute()
        )
    except Exception as exc:
        logger.error("Check-in failed for campaign %s: %s", campaign_id, exc)
        raise HTTPException(status_code=500, detail="Check-in failed")

    return {"success": True, "data": result.data[0] if result.data else {}}


# ── POST /campaigns/{id}/rsvp ─────────────────────────────────────────────────


@router.post("/{campaign_id}/rsvp", status_code=201)
def public_rsvp(
    body: PublicRsvpRequest,
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    supabase=Depends(get_supabase_client),
):
    """Public RSVP — no auth required. Creates a pending signup."""
    _get_campaign_or_404(supabase, campaign_id)
    user_id = _find_or_create_user_by_email(supabase, body.email, body.name)

    existing = (
        supabase.table("signups")
        .select("id, status")
        .eq("campaign_id", campaign_id)
        .eq("user_id", user_id)
        .execute()
    )

    if existing.data and existing.data[0]["status"] in ("pending", "confirmed"):
        return {"success": True, "data": existing.data[0], "message": "Already registered"}

    try:
        result = (
            supabase.table("signups")
            .insert({"campaign_id": campaign_id, "user_id": user_id, "status": "pending"})
            .execute()
        )
    except Exception as exc:
        logger.error("Public RSVP failed for campaign %s: %s", campaign_id, exc)
        raise HTTPException(status_code=500, detail="RSVP failed")

    return {"success": True, "data": result.data[0] if result.data else {}}
