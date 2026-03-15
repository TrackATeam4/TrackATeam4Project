"""Flyers router: generate and retrieve campaign flyers."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from supabase_client import get_supabase_client
from services.flyer_generator import (
    FlyerCampaignData,
    generate_flyer_bytes,
    SUPPORTED_STYLES,
    DEFAULT_POSTER_STYLE,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/flyers", tags=["flyers"])

_CAMPAIGN_SELECT_FIELDS = (
    "title, location, address, date, start_time, end_time, description"
)


class GenerateFlyerRequest(BaseModel):
    campaign_id: str = Field(
        ..., description="UUID of the campaign to generate a flyer for"
    )
    template_id: Optional[str] = Field(
        None,
        description="Optional flyer template UUID; defaults to the active template",
    )
    style: str = Field(
        DEFAULT_POSTER_STYLE,
        description=f"Poster visual style. One of: {sorted(SUPPORTED_STYLES)}",
    )


@router.post("", status_code=201)
def generate_flyer(
    body: GenerateFlyerRequest,
    supabase=Depends(get_supabase_client),
):
    """Generate a PDF flyer for a campaign, upload it to Supabase Storage, and record it in campaign_flyers."""
    if body.style not in SUPPORTED_STYLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid style '{body.style}'. Valid styles: {sorted(SUPPORTED_STYLES)}",
        )

    # Fetch campaign
    campaign_result = (
        supabase.table("campaigns")
        .select(_CAMPAIGN_SELECT_FIELDS)
        .eq("id", body.campaign_id)
        .limit(1)
        .execute()
    )
    campaign_rows = campaign_result.data or []
    if not campaign_rows:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Fetch template
    template_query = supabase.table("flyer_templates").select("id, thumbnail_url")
    if body.template_id:
        template_query = template_query.eq("id", body.template_id)
    else:
        template_query = template_query.eq("is_active", True)
    template_result = template_query.limit(1).execute()

    templates = template_result.data or []
    if not templates:
        raise HTTPException(status_code=404, detail="No active flyer template found")

    template = templates[0]

    # Generate PDF bytes in memory
    try:
        campaign_data = FlyerCampaignData.from_dict(campaign_rows[0])
        pdf_bytes = generate_flyer_bytes(campaign_data, style=body.style)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(
            "Flyer generation failed for campaign %s: %s", body.campaign_id, exc
        )
        raise HTTPException(status_code=500, detail="Failed to generate flyer")

    # Upload to Supabase Storage bucket "flyers"
    storage_path = f"flyers/{body.campaign_id}.pdf"
    try:
        supabase.storage.from_("flyers").upload(
            path=storage_path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
    except Exception as exc:
        logger.error("Flyer upload failed for campaign %s: %s", body.campaign_id, exc)
        raise HTTPException(status_code=500, detail="Failed to upload flyer")

    generated_file_url = supabase.storage.from_("flyers").get_public_url(storage_path)

    # Upsert campaign_flyers record
    try:
        supabase.table("campaign_flyers").insert(
            {
                "campaign_id": body.campaign_id,
                "template_id": template["id"],
                "custom_fields": {},
                "generated_file_url": generated_file_url,
            }
        ).execute()
    except Exception as exc:
        logger.error(
            "Failed to insert campaign_flyers record for campaign %s: %s",
            body.campaign_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="Failed to save flyer record")

    return {
        "campaign_id": body.campaign_id,
        "flyer_url": generated_file_url,
        "thumbnail_url": template.get("thumbnail_url", ""),
    }
