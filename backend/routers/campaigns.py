"""Volunteer Campaign CRUD endpoints."""

import logging
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field

from auth import get_current_user
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

_UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
_TIME_PATTERN = r"^\d{2}:\d{2}$"

CampaignStatus = Literal["draft", "published", "completed", "cancelled"]


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


def _get_campaign_or_404(supabase, campaign_id: str) -> dict:
    result = (
        supabase.table("campaigns").select("*").eq("id", campaign_id).single().execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return result.data


# ── POST /campaigns ──────────────────────────────────────────────────────────


@router.post("", status_code=201)
def create_campaign(
    body: CampaignCreate,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Create a new campaign. Auth required."""
    user_id = user.user.id

    row = {
        "organizer_id": user_id,
        "title": body.title,
        "description": body.description,
        "location": body.location,
        "address": body.address,
        "latitude": body.latitude,
        "longitude": body.longitude,
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
        supabase.table("signups").select("campaign_id").eq("user_id", user_id).execute()
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
