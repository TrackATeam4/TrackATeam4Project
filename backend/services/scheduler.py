"""APScheduler background job for campaign reminder emails."""

import logging
from datetime import date, datetime, time, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from services.email_service import send_reminder
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler()

_REMINDER_HOURS = (24, 1)
_WINDOW_HALF_HOURS = 0.5


def _check_and_send_reminders() -> None:
    """Find campaigns starting soon and email confirmed volunteers."""
    supabase = get_supabase_client()
    now = datetime.now(timezone.utc)

    try:
        campaigns_result = (
            supabase.table("campaigns")
            .select("id, title, address, date, start_time")
            .eq("status", "published")
            .execute()
        )
        campaigns = campaigns_result.data or []
    except Exception as exc:
        logger.error("Scheduler: failed to fetch campaigns: %s", exc)
        return

    for campaign in campaigns:
        try:
            campaign_dt = datetime.fromisoformat(
                f"{campaign['date']}T{campaign['start_time']}+00:00"
            )
        except (ValueError, KeyError):
            continue

        hours_until = None
        for offset in _REMINDER_HOURS:
            window_start = now + timedelta(hours=offset - _WINDOW_HALF_HOURS)
            window_end = now + timedelta(hours=offset + _WINDOW_HALF_HOURS)
            if window_start <= campaign_dt <= window_end:
                hours_until = offset
                break

        if hours_until is None:
            continue

        try:
            signups_result = (
                supabase.table("signups")
                .select("user_id")
                .eq("campaign_id", campaign["id"])
                .eq("status", "confirmed")
                .execute()
            )
            user_ids = [s["user_id"] for s in (signups_result.data or [])]
        except Exception as exc:
            logger.error("Scheduler: failed to fetch signups for %s: %s", campaign["id"], exc)
            continue

        if not user_ids:
            continue

        try:
            users_result = (
                supabase.table("users")
                .select("email, name")
                .in_("id", user_ids)
                .execute()
            )
        except Exception as exc:
            logger.error("Scheduler: failed to fetch users: %s", exc)
            continue

        c_date = date.fromisoformat(campaign["date"])
        c_time = time.fromisoformat(campaign["start_time"])

        for user in users_result.data or []:
            send_reminder(
                to_email=user["email"],
                volunteer_name=user.get("name", ""),
                campaign_title=campaign["title"],
                campaign_address=campaign["address"],
                campaign_date=c_date,
                campaign_start_time=c_time,
                campaign_id=campaign["id"],
                hours_until=hours_until,
            )


def start_scheduler() -> None:
    """Start the background reminder scheduler (runs every hour)."""
    _scheduler.add_job(
        _check_and_send_reminders,
        trigger="interval",
        hours=1,
        id="campaign_reminders",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Reminder scheduler started")


def stop_scheduler() -> None:
    """Gracefully stop the scheduler on app shutdown."""
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Reminder scheduler stopped")
