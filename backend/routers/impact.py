"""Impact report endpoints."""

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from auth import get_current_user
from supabase_client import get_supabase_client
from services.rewards import award_points, check_and_award_badges

logger = logging.getLogger(__name__)

router = APIRouter()

_UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

# Points awarded for submitting an impact report (must match POINT_VALUES in rewards service)
REPORT_POINTS = 10


class ImpactReportCreate(BaseModel):
    flyers_distributed: int = Field(ge=0)
    families_reached: int = Field(ge=0)
    volunteers_attended: int = Field(ge=0)
    notes: Optional[str] = Field(default=None, max_length=5000)
    photos: Annotated[list[str], Field(max_length=20)] = []


@router.post("/campaigns/{campaign_id}/impact", status_code=201)
def create_impact_report(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    body: ImpactReportCreate = ...,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Submit a post-event impact report. Organizer only."""
    user_id = user.user.id

    campaign_result = (
        supabase.table("campaigns")
        .select("id, organizer_id")
        .eq("id", campaign_id)
        .single()
        .execute()
    )
    campaign = campaign_result.data
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign["organizer_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the organizer can submit a report")

    try:
        report_row = {
            "campaign_id": campaign_id,
            "submitted_by": user_id,
            "flyers_distributed": body.flyers_distributed,
            "families_reached": body.families_reached,
            "volunteers_attended": body.volunteers_attended,
            "notes": body.notes,
            "photos": body.photos,
        }
        insert_result = supabase.table("impact_reports").insert(report_row).execute()
        report_data = insert_result.data
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="Impact report already submitted for this campaign",
            )
        logger.error("Failed to insert impact report for campaign %s: %s", campaign_id, exc)
        raise HTTPException(status_code=500, detail="Failed to create report")

    award_points(supabase, user_id, "report", REPORT_POINTS, campaign_id)
    check_and_award_badges(supabase, user_id)

    return {"success": True, "data": report_data}


@router.get("/campaigns/{campaign_id}/impact")
def get_impact_report(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Get the impact report for a campaign. Auth required."""
    report_result = (
        supabase.table("impact_reports")
        .select("*")
        .eq("campaign_id", campaign_id)
        .single()
        .execute()
    )
    report = report_result.data
    if not report:
        raise HTTPException(status_code=404, detail="Impact report not found")

    return {"success": True, "data": report}
