"""Invitation management and RSVP endpoints."""

import logging
import os
import secrets
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr

from auth import get_current_user
from services.calendar import build_google_calendar_url, build_ics
from services.email_service import send_campaign_invite, send_rsvp_confirmation
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["invitations"])

_UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
_INVITE_EXPIRY_DAYS = 7
_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


class SendInviteRequest(BaseModel):
    email: EmailStr


def _get_campaign_or_404(supabase, campaign_id: str) -> dict:
    result = (
        supabase.table("campaigns").select("*").eq("id", campaign_id).single().execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return result.data


def _get_invitation_by_token(supabase, token: str) -> dict:
    result = (
        supabase.table("invitations").select("*").eq("token", token).single().execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return result.data


def _check_expired(invitation: dict) -> None:
    expires_at = datetime.fromisoformat(invitation["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=410, detail="This invitation has expired")


def _parse_campaign_datetimes(campaign: dict) -> tuple[date, time, time]:
    return (
        date.fromisoformat(campaign["date"]),
        time.fromisoformat(campaign["start_time"]),
        time.fromisoformat(campaign["end_time"]),
    )


def _get_organizer_email(supabase, organizer_id: str) -> str:
    result = (
        supabase.table("users").select("email").eq("id", organizer_id).single().execute()
    )
    return result.data["email"] if result.data else "noreply@tracka.app"


# ── GET /campaigns/{id}/calendar-url ─────────────────────────────────────────


@router.get("/campaigns/{campaign_id}/calendar-url")
def get_campaign_calendar_url(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Return a pre-filled Google Calendar URL for any campaign. Auth required."""
    campaign = _get_campaign_or_404(supabase, campaign_id)
    c_date, c_start, c_end = _parse_campaign_datetimes(campaign)

    url = build_google_calendar_url(
        title=campaign["title"],
        description=campaign.get("description") or "",
        location=campaign["address"],
        event_date=c_date,
        start_time=c_start,
        end_time=c_end,
    )
    return {"success": True, "data": {"google_calendar_url": url, "campaign_id": campaign_id}}


# ── POST /campaigns/{id}/invitations ─────────────────────────────────────────


@router.post("/campaigns/{campaign_id}/invitations", status_code=201)
def send_invitation(
    body: SendInviteRequest,
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Organizer sends an email invitation for a campaign."""
    organizer_id = user.user.id
    campaign = _get_campaign_or_404(supabase, campaign_id)

    if campaign["organizer_id"] != organizer_id:
        raise HTTPException(status_code=403, detail="Only the organizer can send invitations")

    existing = (
        supabase.table("invitations")
        .select("id, status")
        .eq("campaign_id", campaign_id)
        .eq("email", str(body.email))
        .execute()
    )
    if existing.data and existing.data[0]["status"] in ("pending", "accepted"):
        raise HTTPException(
            status_code=409,
            detail="An active invitation has already been sent to this email",
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=_INVITE_EXPIRY_DAYS)

    try:
        result = (
            supabase.table("invitations")
            .insert({
                "campaign_id": campaign_id,
                "invited_by": organizer_id,
                "email": str(body.email),
                "token": token,
                "status": "pending",
                "expires_at": expires_at.isoformat(),
            })
            .execute()
        )
    except Exception as exc:
        logger.error("Failed to create invitation for campaign %s: %s", campaign_id, exc)
        raise HTTPException(status_code=500, detail="Failed to create invitation")

    organizer_email = _get_organizer_email(supabase, organizer_id)
    c_date, c_start, c_end = _parse_campaign_datetimes(campaign)

    send_campaign_invite(
        to_email=str(body.email),
        campaign_title=campaign["title"],
        campaign_description=campaign.get("description") or "",
        campaign_address=campaign["address"],
        campaign_date=c_date,
        campaign_start_time=c_start,
        campaign_end_time=c_end,
        campaign_id=campaign_id,
        invite_token=token,
        organizer_email=organizer_email,
    )

    invite_url = f"{_FRONTEND_URL}/invite/{token}"
    row = result.data[0] if result.data else {}
    return {"success": True, "data": {**row, "invite_url": invite_url}}


# ── GET /campaigns/{id}/invitations ──────────────────────────────────────────


@router.get("/campaigns/{campaign_id}/invitations")
def list_invitations(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """List all invitations for a campaign. Organizer only."""
    organizer_id = user.user.id
    campaign = _get_campaign_or_404(supabase, campaign_id)

    if campaign["organizer_id"] != organizer_id:
        raise HTTPException(status_code=403, detail="Only the organizer can view invitations")

    result = (
        supabase.table("invitations")
        .select("id, email, status, created_at, expires_at")
        .eq("campaign_id", campaign_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"success": True, "data": result.data or []}


# ── GET /invitations/{token} ──────────────────────────────────────────────────


@router.get("/invitations/{token}")
def get_invitation(
    token: str,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Get invitation + campaign details by token. Auth required."""
    invitation = _get_invitation_by_token(supabase, token)
    _check_expired(invitation)

    campaign = _get_campaign_or_404(supabase, invitation["campaign_id"])
    c_date, c_start, c_end = _parse_campaign_datetimes(campaign)

    calendar_url = build_google_calendar_url(
        title=campaign["title"],
        description=campaign.get("description") or "",
        location=campaign["address"],
        event_date=c_date,
        start_time=c_start,
        end_time=c_end,
    )

    return {
        "success": True,
        "data": {
            "invitation": invitation,
            "campaign": campaign,
            "google_calendar_url": calendar_url,
        },
    }


# ── POST /invitations/{token}/accept ─────────────────────────────────────────


@router.post("/invitations/{token}/accept")
def accept_invitation(
    token: str,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Accept an invitation and create a signup. Auth required."""
    invitation = _get_invitation_by_token(supabase, token)
    _check_expired(invitation)

    user_id = user.user.id
    user_email = user.user.email

    if user_email.lower() != invitation["email"].lower():
        raise HTTPException(
            status_code=403,
            detail="This invitation was sent to a different email address",
        )

    if invitation["status"] == "accepted":
        return {"success": True, "data": {"message": "Already accepted"}}

    campaign_id = invitation["campaign_id"]
    campaign = _get_campaign_or_404(supabase, campaign_id)

    # Ensure the auth user has a corresponding row in the public users table.
    # Supabase auth creates auth.users but not the app's public users table.
    user_meta = user.user.user_metadata or {}
    display_name = (
        user_meta.get("full_name")
        or user_meta.get("name")
        or user_email.split("@")[0]
    )
    supabase.table("users").upsert(
        {"id": user_id, "email": user_email, "name": display_name, "role": "volunteer"},
        on_conflict="id",
    ).execute()

    existing_signup = (
        supabase.table("signups")
        .select("id, status")
        .eq("campaign_id", campaign_id)
        .eq("user_id", user_id)
        .execute()
    )

    try:
        if existing_signup.data and existing_signup.data[0]["status"] in ("pending", "confirmed"):
            signup = existing_signup.data[0]
        else:
            signup_result = (
                supabase.table("signups")
                .insert({"campaign_id": campaign_id, "user_id": user_id, "status": "pending"})
                .execute()
            )
            signup = signup_result.data[0] if signup_result.data else {}

        supabase.table("invitations").update({"status": "accepted"}).eq(
            "id", invitation["id"]
        ).execute()
    except Exception as exc:
        logger.error("Failed to accept invitation %s: %s", token, exc)
        raise HTTPException(status_code=500, detail="Failed to accept invitation")

    organizer_email = _get_organizer_email(supabase, campaign["organizer_id"])
    c_date, c_start, c_end = _parse_campaign_datetimes(campaign)

    calendar_url = build_google_calendar_url(
        title=campaign["title"],
        description=campaign.get("description") or "",
        location=campaign["address"],
        event_date=c_date,
        start_time=c_start,
        end_time=c_end,
    )

    user_record = (
        supabase.table("users").select("name").eq("id", user_id).single().execute()
    )
    volunteer_name = user_record.data["name"] if user_record.data else ""

    send_rsvp_confirmation(
        to_email=user_email,
        volunteer_name=volunteer_name,
        campaign_title=campaign["title"],
        campaign_description=campaign.get("description") or "",
        campaign_address=campaign["address"],
        campaign_date=c_date,
        campaign_start_time=c_start,
        campaign_end_time=c_end,
        campaign_id=campaign_id,
        organizer_email=organizer_email,
    )

    return {
        "success": True,
        "data": {"signup": signup, "google_calendar_url": calendar_url},
    }


# ── POST /invitations/{token}/decline ────────────────────────────────────────


@router.post("/invitations/{token}/decline")
def decline_invitation(
    token: str,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Decline an invitation. Auth required."""
    invitation = _get_invitation_by_token(supabase, token)

    if user.user.email.lower() != invitation["email"].lower():
        raise HTTPException(
            status_code=403,
            detail="This invitation was sent to a different email address",
        )

    if invitation["status"] == "accepted":
        raise HTTPException(
            status_code=409, detail="Cannot decline an already accepted invitation"
        )

    try:
        supabase.table("invitations").update({"status": "expired"}).eq(
            "id", invitation["id"]
        ).execute()
    except Exception as exc:
        logger.error("Failed to decline invitation %s: %s", token, exc)
        raise HTTPException(status_code=500, detail="Failed to decline invitation")

    return {"success": True, "data": {"message": "Invitation declined"}}


# ── GET /invitations/{token}/calendar.ics ─────────────────────────────────────


@router.get("/invitations/{token}/calendar.ics")
def download_ics(
    token: str,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Download .ics file for an invitation. Auth required."""
    invitation = _get_invitation_by_token(supabase, token)
    campaign = _get_campaign_or_404(supabase, invitation["campaign_id"])

    organizer_email = _get_organizer_email(supabase, campaign["organizer_id"])
    c_date, c_start, c_end = _parse_campaign_datetimes(campaign)

    ics_bytes = build_ics(
        title=campaign["title"],
        description=campaign.get("description") or "",
        location=campaign["address"],
        event_date=c_date,
        start_time=c_start,
        end_time=c_end,
        event_uid=campaign["id"],
        organizer_email=organizer_email,
    )

    return Response(
        content=ics_bytes,
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="invite.ics"'},
    )
