"""Admin stats endpoints."""

import logging

from fastapi import APIRouter, Depends

from auth import get_current_user
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _count_table(supabase, table_name: str) -> int:
    result = supabase.table(table_name).select("id", count="exact").execute()
    return result.count or 0


@router.get("/stats")
def get_admin_stats(
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Return aggregate stats for the admin dashboard."""
    stats = {
        "users": _count_table(supabase, "users"),
        "campaigns": _count_table(supabase, "campaigns"),
        "signups": _count_table(supabase, "signups"),
        "posts": _count_table(supabase, "posts"),
        "impact_reports": _count_table(supabase, "impact_reports"),
        "event_impact_reports": _count_table(supabase, "event_impact_reports"),
        "chat_sessions": _count_table(supabase, "chat_sessions"),
        "chat_messages": _count_table(supabase, "chat_messages"),
    }

    return {"success": True, "data": stats}
