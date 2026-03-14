"""Email sending service using Resend."""

import base64
import logging
import os
from datetime import date, time

import resend

from services.calendar import build_google_calendar_url, build_ics

logger = logging.getLogger(__name__)

resend.api_key = os.getenv("RESEND_API_KEY", "")

_FROM_EMAIL = os.getenv("FROM_EMAIL", "onboarding@resend.dev")
_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

_GREEN = "#22c55e"
_BLUE = "#3b82f6"
_BTN = "padding:12px 24px;text-decoration:none;border-radius:6px;color:white;font-family:Arial,sans-serif"


def _ics_attachment(ics_bytes: bytes, filename: str) -> dict:
    return {"filename": filename, "content": base64.b64encode(ics_bytes).decode()}


def send_campaign_invite(
    to_email: str,
    campaign_title: str,
    campaign_description: str,
    campaign_address: str,
    campaign_date: date,
    campaign_start_time: time,
    campaign_end_time: time,
    campaign_id: str,
    invite_token: str,
    organizer_email: str,
) -> bool:
    """Send a campaign invitation email with RSVP link and .ics attachment."""
    rsvp_url = f"{_FRONTEND_URL}/invite/{invite_token}"
    calendar_url = build_google_calendar_url(
        title=campaign_title,
        description=campaign_description,
        location=campaign_address,
        event_date=campaign_date,
        start_time=campaign_start_time,
        end_time=campaign_end_time,
    )
    ics_bytes = build_ics(
        title=campaign_title,
        description=campaign_description,
        location=campaign_address,
        event_date=campaign_date,
        start_time=campaign_start_time,
        end_time=campaign_end_time,
        event_uid=campaign_id,
        organizer_email=organizer_email,
    )

    date_str = campaign_date.strftime("%B %d, %Y")
    start_str = campaign_start_time.strftime("%I:%M %p")
    end_str = campaign_end_time.strftime("%I:%M %p")
    desc_html = f"<p>{campaign_description}</p>" if campaign_description else ""

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:{_GREEN}">You're invited to volunteer!</h2>
      <h3 style="margin-top:0">{campaign_title}</h3>
      <p><strong>Date:</strong> {date_str}</p>
      <p><strong>Time:</strong> {start_str} – {end_str}</p>
      <p><strong>Location:</strong> {campaign_address}</p>
      {desc_html}
      <div style="margin:30px 0;display:flex;gap:12px">
        <a href="{rsvp_url}" style="{_BTN};background:{_GREEN};margin-right:12px">RSVP Now</a>
        <a href="{calendar_url}" style="{_BTN};background:{_BLUE}">Add to Google Calendar</a>
      </div>
      <p style="color:#6b7280;font-size:13px">
        Or copy this link: <a href="{rsvp_url}">{rsvp_url}</a>
      </p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": _FROM_EMAIL,
            "to": [to_email],
            "subject": f"You're invited: {campaign_title}",
            "html": html,
            "attachments": [_ics_attachment(ics_bytes, "invite.ics")],
        })
        logger.info("Invite email sent to %s for campaign %s", to_email, campaign_id)
        return True
    except Exception as exc:
        logger.error("Failed to send invite email to %s: %s", to_email, exc)
        return False


def send_rsvp_confirmation(
    to_email: str,
    volunteer_name: str,
    campaign_title: str,
    campaign_description: str,
    campaign_address: str,
    campaign_date: date,
    campaign_start_time: time,
    campaign_end_time: time,
    campaign_id: str,
    organizer_email: str,
) -> bool:
    """Send RSVP confirmation email with .ics attachment after volunteer accepts."""
    calendar_url = build_google_calendar_url(
        title=campaign_title,
        description=campaign_description,
        location=campaign_address,
        event_date=campaign_date,
        start_time=campaign_start_time,
        end_time=campaign_end_time,
    )
    ics_bytes = build_ics(
        title=campaign_title,
        description=campaign_description,
        location=campaign_address,
        event_date=campaign_date,
        start_time=campaign_start_time,
        end_time=campaign_end_time,
        event_uid=campaign_id,
        organizer_email=organizer_email,
    )

    date_str = campaign_date.strftime("%B %d, %Y")
    start_str = campaign_start_time.strftime("%I:%M %p")
    end_str = campaign_end_time.strftime("%I:%M %p")
    greeting = f"Hi {volunteer_name}," if volunteer_name else "Hi there,"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:{_GREEN}">You're confirmed!</h2>
      <p>{greeting}</p>
      <p>Thanks for signing up to volunteer at <strong>{campaign_title}</strong>.</p>
      <p><strong>Date:</strong> {date_str}</p>
      <p><strong>Time:</strong> {start_str} – {end_str}</p>
      <p><strong>Location:</strong> {campaign_address}</p>
      <div style="margin:30px 0">
        <a href="{calendar_url}" style="{_BTN};background:{_BLUE}">Add to Google Calendar</a>
      </div>
      <p style="color:#6b7280;font-size:13px">We look forward to seeing you there!</p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": _FROM_EMAIL,
            "to": [to_email],
            "subject": f"Confirmed: {campaign_title}",
            "html": html,
            "attachments": [_ics_attachment(ics_bytes, "event.ics")],
        })
        logger.info("Confirmation email sent to %s", to_email)
        return True
    except Exception as exc:
        logger.error("Failed to send confirmation email to %s: %s", to_email, exc)
        return False


def send_reminder(
    to_email: str,
    volunteer_name: str,
    campaign_title: str,
    campaign_address: str,
    campaign_date: date,
    campaign_start_time: time,
    campaign_id: str,
    hours_until: int,
) -> bool:
    """Send a reminder email to a confirmed volunteer."""
    when = "tomorrow" if hours_until >= 24 else "in about an hour"
    date_str = campaign_date.strftime("%B %d, %Y")
    start_str = campaign_start_time.strftime("%I:%M %p")
    greeting = f"Hi {volunteer_name}," if volunteer_name else "Hi there,"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:{_GREEN}">Reminder: {campaign_title} is {when}!</h2>
      <p>{greeting}</p>
      <p>Just a reminder that you're signed up to volunteer at <strong>{campaign_title}</strong>.</p>
      <p><strong>Date:</strong> {date_str}</p>
      <p><strong>Time:</strong> {start_str}</p>
      <p><strong>Location:</strong> {campaign_address}</p>
      <p style="color:#6b7280;font-size:13px">See you there!</p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": _FROM_EMAIL,
            "to": [to_email],
            "subject": f"Reminder: {campaign_title} is {when}",
            "html": html,
        })
        logger.info("Reminder sent to %s for campaign %s (%dh)", to_email, campaign_id, hours_until)
        return True
    except Exception as exc:
        logger.error("Failed to send reminder to %s: %s", to_email, exc)
        return False
