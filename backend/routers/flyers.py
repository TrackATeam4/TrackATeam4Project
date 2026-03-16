"""Flyers router: generate and retrieve campaign flyers."""

import logging
from typing import Any, Optional

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


def _is_storage_exists_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "already exists" in message or "resource already exists" in message


def _upload_flyer_pdf(bucket, storage_path: str, pdf_bytes: bytes) -> None:
    file_options = {
        "content-type": "application/pdf",
        # Supabase Storage expects string values for this option in some client versions.
        "upsert": "true",
    }
    try:
        bucket.upload(path=storage_path, file=pdf_bytes, file_options=file_options)
    except Exception as exc:
        if not _is_storage_exists_error(exc):
            raise
        # Fallback for SDK versions that ignore upload upsert and still return duplicate errors.
        bucket.update(
            path=storage_path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )


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
    bucket = supabase.storage.from_("flyers")
    try:
        _upload_flyer_pdf(bucket, storage_path, pdf_bytes)
    except Exception as exc:
        logger.error("Flyer upload failed for campaign %s: %s", body.campaign_id, exc)
        raise HTTPException(status_code=500, detail="Failed to upload flyer")

    generated_file_url = bucket.get_public_url(storage_path)

    # Upsert campaign_flyers record
    try:
        supabase.table("campaign_flyers").upsert(
            {
                "campaign_id": body.campaign_id,
                "template_id": template["id"],
                "custom_fields": {},
                "generated_file_url": generated_file_url,
            },
            on_conflict="campaign_id",
        ).execute()
    except Exception as exc:
        logger.error(
            "Failed to upsert campaign_flyers record for campaign %s: %s",
            body.campaign_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="Failed to save flyer record")

    return {
        "campaign_id": body.campaign_id,
        "flyer_url": generated_file_url,
        "thumbnail_url": template.get("thumbnail_url", ""),
    }


def _extract_public_url(url_payload: Any) -> str:
    if isinstance(url_payload, str):
        return url_payload
    if isinstance(url_payload, dict):
        for key in ("publicUrl", "publicURL", "signedUrl", "signedURL"):
            value = url_payload.get(key)
            if isinstance(value, str):
                return value
        nested = url_payload.get("data")
        if isinstance(nested, dict):
            for key in ("publicUrl", "publicURL", "signedUrl", "signedURL"):
                value = nested.get(key)
                if isinstance(value, str):
                    return value
    return ""


@router.get("/templates")
def list_flyer_templates(supabase=Depends(get_supabase_client)):
    """List all PDF templates currently stored in the Supabase 'flyers' bucket."""
    bucket = supabase.storage.from_("flyers")
    try:
        listed = bucket.list(path="templates")
    except Exception as exc:
        logger.error("Failed listing flyer templates from storage: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch flyer templates")

    if isinstance(listed, list):
        rows = listed
    else:
        rows = getattr(listed, "data", None) or []

    templates = []
    for row in rows:
        name = str(row.get("name", "")).strip() if isinstance(row, dict) else ""
        if not name or not name.lower().endswith(".pdf"):
            continue
        templates.append(
            {
                "name": name,
                "path": name,
                "url": _extract_public_url(bucket.get_public_url(name)),
                "updated_at": row.get("updated_at") if isinstance(row, dict) else None,
                "created_at": row.get("created_at") if isinstance(row, dict) else None,
            }
        )

    templates.sort(key=lambda item: item["name"].lower())
    return {"templates": templates}
