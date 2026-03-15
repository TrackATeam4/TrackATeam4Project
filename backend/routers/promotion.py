"""Promotion endpoint."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import JSONResponse

from auth import get_current_user
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter()

_UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


@router.post("/campaigns/{campaign_id}/promote")
def promote_campaign(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Boost a campaign for 24 hours. Organizer only, once per campaign."""
    user_id = user.user.id

    campaign_result = (
        supabase.table("campaigns")
        .select("id, organizer_id, promoted_at")
        .eq("id", campaign_id)
        .limit(1)
        .execute()
    )
    rows = campaign_result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Campaign not found")
    campaign = rows[0]

    if campaign["organizer_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the organizer can promote a campaign")

    if campaign.get("promoted_at") is not None:
        return JSONResponse(
            status_code=409,
            content={
                "success": False,
                "error": "Campaign has already been promoted",
                "code": "ALREADY_PROMOTED",
            },
        )

    now = datetime.now(timezone.utc)
    until = now + timedelta(hours=24)
    supabase.table("campaigns").update({
        "promoted_at": now.isoformat(),
        "promoted_until": until.isoformat(),
    }).eq("id", campaign_id).execute()

    return {
        "success": True,
        "data": {
            "campaign_id": campaign_id,
            "promoted_at": now.isoformat(),
            "promoted_until": until.isoformat(),
        },
    }
