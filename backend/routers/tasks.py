"""Task endpoints for campaign volunteer assignment flows."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from auth import get_current_user
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["tasks"])

_UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    max_assignees: int = Field(default=1, ge=1)


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    max_assignees: Optional[int] = Field(default=None, ge=1)
    assigned_to: Optional[str] = None


def _get_campaign_or_404(supabase, campaign_id: str) -> dict:
    result = (
        supabase.table("campaigns").select("*").eq("id", campaign_id).limit(1).execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return rows[0]


def _get_task_or_404(supabase, task_id: str) -> dict:
    result = supabase.table("tasks").select("*").eq("id", task_id).limit(1).execute()
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Task not found")
    return rows[0]


@router.get("/campaigns/{campaign_id}/tasks")
def list_campaign_tasks(
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    supabase=Depends(get_supabase_client),
):
    """List tasks for a campaign. Public."""
    _get_campaign_or_404(supabase, campaign_id)

    result = (
        supabase.table("tasks")
        .select("*")
        .eq("campaign_id", campaign_id)
        .order("created_at", desc=False)
        .execute()
    )

    return {"success": True, "data": result.data or []}


@router.post("/campaigns/{campaign_id}/tasks", status_code=201)
def create_campaign_task(
    body: TaskCreate,
    campaign_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Create a task for a campaign. Organizer only."""
    user_id = user.user.id
    campaign = _get_campaign_or_404(supabase, campaign_id)

    if campaign["organizer_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Only the organizer can create campaign tasks"
        )

    row = {
        "campaign_id": campaign_id,
        "title": body.title,
        "description": body.description,
        "max_assignees": body.max_assignees,
        "assigned_to": None,
    }

    try:
        result = supabase.table("tasks").insert(row).execute()
    except Exception as exc:
        logger.error("Failed to create task for campaign %s: %s", campaign_id, exc)
        raise HTTPException(status_code=500, detail="Failed to create task")

    return {"success": True, "data": result.data[0] if result.data else None}


@router.put("/tasks/{task_id}")
def update_task(
    body: TaskUpdate,
    task_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Update/assign task. Organizer only."""
    user_id = user.user.id
    task = _get_task_or_404(supabase, task_id)
    campaign = _get_campaign_or_404(supabase, task["campaign_id"])

    if campaign["organizer_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Only the organizer can update this task"
        )

    updates = body.model_dump(exclude_unset=True)

    if "max_assignees" in updates:
        assigned_count_result = (
            supabase.table("signups")
            .select("id", count="exact")
            .eq("campaign_id", campaign["id"])
            .eq("task_id", task_id)
            .neq("status", "cancelled")
            .execute()
        )
        assigned_count = assigned_count_result.count or 0
        if updates["max_assignees"] < assigned_count:
            raise HTTPException(
                status_code=400,
                detail="max_assignees cannot be lower than current assignments",
            )

    if not updates:
        return {"success": True, "data": task}

    previous_assignee = task.get("assigned_to")

    try:
        update_result = (
            supabase.table("tasks").update(updates).eq("id", task_id).execute()
        )
        updated_task = update_result.data[0] if update_result.data else task

        if "assigned_to" in body.model_fields_set:
            new_assignee = body.assigned_to
            if new_assignee:
                signup_result = (
                    supabase.table("signups")
                    .select("id, status")
                    .eq("campaign_id", campaign["id"])
                    .eq("user_id", new_assignee)
                    .execute()
                )
                signup_rows = signup_result.data or []
                if not signup_rows or signup_rows[0]["status"] == "cancelled":
                    raise HTTPException(
                        status_code=400,
                        detail="Assigned user must have an active signup for this campaign",
                    )

                if (updated_task.get("max_assignees") or 1) == 1:
                    (
                        supabase.table("signups")
                        .update({"task_id": None})
                        .eq("campaign_id", campaign["id"])
                        .eq("task_id", task_id)
                        .neq("user_id", new_assignee)
                        .execute()
                    )

                (
                    supabase.table("signups")
                    .update({"task_id": task_id})
                    .eq("campaign_id", campaign["id"])
                    .eq("user_id", new_assignee)
                    .execute()
                )

            elif previous_assignee:
                (
                    supabase.table("signups")
                    .update({"task_id": None})
                    .eq("campaign_id", campaign["id"])
                    .eq("user_id", previous_assignee)
                    .eq("task_id", task_id)
                    .execute()
                )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to update task %s: %s", task_id, exc)
        raise HTTPException(status_code=500, detail="Failed to update task")

    return {"success": True, "data": updated_task}


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Delete a task. Organizer only."""
    user_id = user.user.id
    task = _get_task_or_404(supabase, task_id)
    campaign = _get_campaign_or_404(supabase, task["campaign_id"])

    if campaign["organizer_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Only the organizer can delete this task"
        )

    try:
        (
            supabase.table("signups")
            .update({"task_id": None})
            .eq("campaign_id", campaign["id"])
            .eq("task_id", task_id)
            .execute()
        )
        supabase.table("tasks").delete().eq("id", task_id).execute()
    except Exception as exc:
        logger.error("Failed to delete task %s: %s", task_id, exc)
        raise HTTPException(status_code=500, detail="Failed to delete task")

    return {"success": True, "data": {"id": task_id}}


@router.post("/tasks/{task_id}/assign")
def assign_task_to_self(
    task_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Volunteer self-assigns to a task. Auth required."""
    user_id = user.user.id
    task = _get_task_or_404(supabase, task_id)
    campaign_id = task["campaign_id"]

    signup_result = (
        supabase.table("signups")
        .select("id, status, task_id")
        .eq("campaign_id", campaign_id)
        .eq("user_id", user_id)
        .execute()
    )
    signup_rows = signup_result.data or []
    if not signup_rows:
        raise HTTPException(
            status_code=403,
            detail="You must sign up for the campaign before assigning a task",
        )

    signup = signup_rows[0]
    if signup["status"] == "cancelled":
        raise HTTPException(
            status_code=400, detail="Cancelled signup cannot assign tasks"
        )

    if signup.get("task_id") == task_id:
        return {"success": True, "data": signup}

    max_assignees = task.get("max_assignees") or 1
    assigned_count_result = (
        supabase.table("signups")
        .select("id", count="exact")
        .eq("campaign_id", campaign_id)
        .eq("task_id", task_id)
        .neq("status", "cancelled")
        .execute()
    )
    assigned_count = assigned_count_result.count or 0

    if assigned_count >= max_assignees:
        raise HTTPException(status_code=409, detail="Task is already full")

    try:
        result = (
            supabase.table("signups")
            .update({"task_id": task_id})
            .eq("campaign_id", campaign_id)
            .eq("user_id", user_id)
            .execute()
        )
        if max_assignees == 1:
            supabase.table("tasks").update({"assigned_to": user_id}).eq(
                "id", task_id
            ).execute()
    except Exception as exc:
        logger.error("Failed self-assignment for task %s: %s", task_id, exc)
        raise HTTPException(status_code=500, detail="Failed to assign task")

    return {"success": True, "data": result.data[0] if result.data else None}


@router.delete("/tasks/{task_id}/assign")
def unassign_task_from_self(
    task_id: str = Path(..., pattern=_UUID_PATTERN),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_client),
):
    """Volunteer unassigns from a task. Auth required."""
    user_id = user.user.id
    task = _get_task_or_404(supabase, task_id)
    campaign_id = task["campaign_id"]

    signup_result = (
        supabase.table("signups")
        .select("id, task_id")
        .eq("campaign_id", campaign_id)
        .eq("user_id", user_id)
        .execute()
    )
    signup_rows = signup_result.data or []
    if not signup_rows or signup_rows[0].get("task_id") != task_id:
        raise HTTPException(status_code=404, detail="Task assignment not found")

    try:
        result = (
            supabase.table("signups")
            .update({"task_id": None})
            .eq("campaign_id", campaign_id)
            .eq("user_id", user_id)
            .execute()
        )
        if task.get("assigned_to") == user_id:
            supabase.table("tasks").update({"assigned_to": None}).eq(
                "id", task_id
            ).execute()
    except Exception as exc:
        logger.error("Failed to unassign task %s: %s", task_id, exc)
        raise HTTPException(status_code=500, detail="Failed to unassign task")

    return {"success": True, "data": result.data[0] if result.data else None}
