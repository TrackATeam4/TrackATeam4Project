"""Calendar utilities: .ics file generation and Google Calendar URL builder."""

import urllib.parse
from datetime import date, datetime, time


def _fmt_dt(d: date, t: time) -> str:
    """Combine date + time into iCalendar datetime string (no timezone = floating)."""
    return datetime.combine(d, t).strftime("%Y%m%dT%H%M%S")


def build_google_calendar_url(
    title: str,
    description: str,
    location: str,
    event_date: date,
    start_time: time,
    end_time: time,
) -> str:
    """Build a pre-filled Google Calendar 'Add Event' URL (no API key required)."""
    params = {
        "action": "TEMPLATE",
        "text": title,
        "dates": f"{_fmt_dt(event_date, start_time)}/{_fmt_dt(event_date, end_time)}",
        "details": description,
        "location": location,
    }
    return f"https://calendar.google.com/calendar/render?{urllib.parse.urlencode(params)}"


def build_ics(
    title: str,
    description: str,
    location: str,
    event_date: date,
    start_time: time,
    end_time: time,
    event_uid: str,
    organizer_email: str,
) -> bytes:
    """Generate an iCalendar (.ics) file as bytes."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TrackA//Campaign//EN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{event_uid}@tracka.app",
        f"DTSTART:{_fmt_dt(event_date, start_time)}",
        f"DTEND:{_fmt_dt(event_date, end_time)}",
        f"SUMMARY:{title}",
        f"DESCRIPTION:{description.replace(chr(10), ' ')}",
        f"LOCATION:{location}",
        f"ORGANIZER:mailto:{organizer_email}",
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines).encode("utf-8")
