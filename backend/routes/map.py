from math import radians, sin, cos, sqrt, atan2
from datetime import datetime, date, time, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field

from supabase_client import get_supabase_client
from auth import verify_token

router = APIRouter(prefix="/map", tags=["Map"])
pantry_router = APIRouter(tags=["Pantry"])
admin_campaign_router = APIRouter(prefix="/admin", tags=["Admin Campaigns"])
admin_analytics_router = APIRouter(prefix="/admin/analytics", tags=["Admin Analytics"])

MAX_RESULTS = 100
VALID_CAMPAIGN_STATUSES = {"draft", "published", "cancelled", "completed"}
VALID_USER_SORT_FIELDS = {"points"}
VALID_SERVICES = [
    "produce",
    "canned_goods",
    "dairy",
    "bread",
    "meat",
    "diapers",
    "formula",
    "baby_clothing",
    "personal_care",
    "household",
    "halal",
    "kosher",
    "gluten_free",
    "prepared_meals",
]


class CampaignStatusUpdateRequest(BaseModel):
    status: str


class PantryRegistrationRequest(BaseModel):
    owner_name: str
    email: EmailStr
    password: str
    pantry_name: str
    description: Optional[str] = None
    address: str
    latitude: float
    longitude: float
    phone: Optional[str] = None
    website: Optional[str] = None
    hours: Dict[str, Any] = Field(default_factory=dict)
    services: List[str] = Field(default_factory=list)


class PantryUpdateRequest(BaseModel):
    pantry_id: str
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    hours: Optional[Dict[str, Any]] = None
    services: Optional[List[str]] = None


class PantryCampaignLinkRequest(BaseModel):
    pantry_id: str


class FlyerTemplateCreateRequest(BaseModel):
    name: str
    file_url: str
    thumbnail_url: Optional[str] = None
    customizable_fields: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class FlyerTemplateUpdateRequest(BaseModel):
    name: Optional[str] = None
    file_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    customizable_fields: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class PantryVerifyRequest(BaseModel):
    is_verified: bool


def success_response(data: Any, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    response = {
        "success": True,
        "data": data,
    }
    if meta is not None:
        response["meta"] = meta
    return response


def error_response(message: str, code: str, status_code: int) -> None:
    raise HTTPException(
        status_code=status_code,
        detail={
            "success": False,
            "error": message,
            "code": code,
        },
    )


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_km = 6371.0

    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)

    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    )
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return earth_radius_km * c


def parse_date_safe(raw_value: Any) -> Optional[date]:
    if raw_value is None:
        return None

    if isinstance(raw_value, date) and not isinstance(raw_value, datetime):
        return raw_value

    try:
        return date.fromisoformat(str(raw_value))
    except ValueError:
        return None


def parse_time_safe(raw_value: Any) -> Optional[time]:
    if raw_value is None:
        return None

    if isinstance(raw_value, time):
        return raw_value

    text = str(raw_value)
    try:
        return time.fromisoformat(text)
    except ValueError:
        # fallback for values like "10:00"
        try:
            return datetime.strptime(text, "%H:%M").time()
        except ValueError:
            return None


def parse_datetime_safe(raw_value: Any) -> Optional[datetime]:
    if raw_value is None:
        return None

    if isinstance(raw_value, datetime):
        return raw_value

    text = str(raw_value).strip()
    if not text:
        return None

    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def get_month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def add_months(month_start: date, offset: int) -> date:
    total_months = (month_start.year * 12 + (month_start.month - 1)) + offset
    year = total_months // 12
    month = (total_months % 12) + 1
    return date(year, month, 1)


def is_campaign_expired(campaign: Dict[str, Any]) -> bool:
    campaign_date = parse_date_safe(campaign.get("date"))
    campaign_end_time = parse_time_safe(campaign.get("end_time"))

    if campaign_date is None or campaign_end_time is None:
        return False

    campaign_end_at = datetime.combine(campaign_date, campaign_end_time)
    return campaign_end_at < datetime.now()


def unwrap_supabase_user(auth_result: Any) -> Any:
    # supabase.auth.get_user(token) often returns an object with a .user field
    return getattr(auth_result, "user", auth_result)


def extract_auth_identity(auth_result: Any) -> Dict[str, Optional[str]]:
    raw_user = unwrap_supabase_user(auth_result)

    return {
        "id": getattr(raw_user, "id", None),
        "email": getattr(raw_user, "email", None),
    }


async def get_current_app_user(auth_result: Any = Depends(verify_token)) -> Dict[str, Any]:
    identity = extract_auth_identity(auth_result)
    user_id = identity.get("id")
    email = identity.get("email")

    supabase = get_supabase_client()

    query = supabase.table("users").select("id, email, name, role").limit(1)

    if user_id:
        result = query.eq("id", user_id).execute()
    elif email:
        result = query.eq("email", email).execute()
    else:
        error_response("Unable to identify authenticated user", "AUTH_INVALID", 401)

    users = result.data or []
    if not users:
        error_response("User not found in application database", "USER_NOT_FOUND", 404)

    return users[0]


async def require_admin(current_user: Dict[str, Any] = Depends(get_current_app_user)) -> Dict[str, Any]:
    if current_user.get("role") != "admin":
        error_response("Admin only", "FORBIDDEN", 403)
    return current_user


def count_signups_by_campaign(signups: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    for signup in signups:
        campaign_id = signup.get("campaign_id")
        if not campaign_id:
            continue
        counts[campaign_id] = counts.get(campaign_id, 0) + 1

    return counts


def summarize_int_field(rows: List[Dict[str, Any]], field: str) -> int:
    total = 0
    for row in rows:
        value = row.get(field, 0)
        if isinstance(value, (int, float)):
            total += int(value)
    return total


def normalize_and_validate_services(raw_services: List[str]) -> List[str]:
    normalized: List[str] = []
    allowed = set(VALID_SERVICES)

    for item in raw_services:
        value = str(item).strip().lower()
        if not value:
            continue
        if value not in allowed:
            error_response(f"Invalid service '{item}'", "INVALID_SERVICE", 400)
        normalized.append(value)

    return normalized


def get_pantry_list_query(
    supabase: Any,
    include_count: bool = False,
) -> Any:
    select_fields = (
        "id, owner_id, name, description, address, latitude, longitude, phone, website, "
        "hours, services, is_verified, created_at"
    )
    if include_count:
        return supabase.table("food_pantries").select(select_fields, count="exact")
    return supabase.table("food_pantries").select(select_fields)


def get_campaign_list_query(
    supabase: Any,
    include_count: bool = False,
) -> Any:
    select_fields = (
        "id, organizer_id, title, description, location, address, date, start_time, end_time, "
        "status, max_volunteers, target_flyers, flyer_template_id, food_pantry_id, latitude, longitude, "
        "promoted_at, promoted_until, tags, created_at, updated_at"
    )
    if include_count:
        return supabase.table("campaigns").select(select_fields, count="exact")
    return supabase.table("campaigns").select(select_fields)


def fetch_owned_pantry(
    supabase: Any,
    pantry_id: str,
    owner_id: str,
) -> Dict[str, Any]:
    pantry_result = (
        get_pantry_list_query(supabase)
        .eq("id", pantry_id)
        .eq("owner_id", owner_id)
        .limit(1)
        .execute()
    )
    pantry_rows = pantry_result.data or []
    if not pantry_rows:
        error_response("Pantry not found or not owned by user", "PANTRY_NOT_FOUND", 404)
    return pantry_rows[0]


@pantry_router.post("/pantry/register")
async def register_pantry_owner(payload: PantryRegistrationRequest):
    owner_name = payload.owner_name.strip()
    pantry_name = payload.pantry_name.strip()
    address = payload.address.strip()

    if not owner_name:
        error_response("owner_name is required", "INVALID_OWNER_NAME", 400)
    if not pantry_name:
        error_response("pantry_name is required", "INVALID_PANTRY_NAME", 400)
    if not address:
        error_response("address is required", "INVALID_ADDRESS", 400)

    services = normalize_and_validate_services(payload.services)

    supabase = get_supabase_client()

    try:
        auth_response = supabase.auth.sign_up(
            {
                "email": str(payload.email),
                "password": payload.password,
                "options": {"data": {"name": owner_name}},
            }
        )
    except Exception as exc:
        error_response(f"Failed to create auth user: {str(exc)}", "AUTH_SIGNUP_FAILED", 400)

    auth_user = getattr(auth_response, "user", None)
    if not auth_user or not getattr(auth_user, "id", None):
        error_response("Auth signup succeeded but user payload is missing", "AUTH_USER_MISSING", 500)

    user_id = auth_user.id

    try:
        app_user_result = (
            supabase.table("users")
            .insert(
                {
                    "id": user_id,
                    "email": str(payload.email),
                    "name": owner_name,
                }
            )
            .select("id, email, name, role, created_at")
            .execute()
        )
    except Exception as exc:
        error_response(
            f"Auth user created but failed to create app user record: {str(exc)}",
            "APP_USER_CREATE_FAILED",
            500,
        )

    created_users = app_user_result.data or []
    if not created_users:
        error_response("Failed to create app user record", "APP_USER_CREATE_FAILED", 500)

    try:
        pantry_result = (
            supabase.table("food_pantries")
            .insert(
                {
                    "owner_id": user_id,
                    "name": pantry_name,
                    "description": payload.description,
                    "address": address,
                    "latitude": payload.latitude,
                    "longitude": payload.longitude,
                    "phone": payload.phone,
                    "website": payload.website,
                    "hours": payload.hours or {},
                    "services": services,
                }
            )
            .select(
                "id, owner_id, name, description, address, latitude, longitude, phone, website, "
                "hours, services, is_verified, created_at"
            )
            .execute()
        )
    except Exception as exc:
        error_response(
            f"User created but failed to create pantry profile: {str(exc)}",
            "PANTRY_CREATE_FAILED",
            500,
        )

    pantry_rows = pantry_result.data or []
    if not pantry_rows:
        error_response("Failed to create pantry profile", "PANTRY_CREATE_FAILED", 500)

    session = getattr(auth_response, "session", None)

    return success_response(
        {
            "user": created_users[0],
            "pantry": pantry_rows[0],
            "session": session,
        }
    )


@pantry_router.get("/pantry/me")
async def get_my_pantries(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_app_user),
):
    supabase = get_supabase_client()
    offset = (page - 1) * limit

    query = (
        get_pantry_list_query(supabase, include_count=True)
        .eq("owner_id", current_user["id"])
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    result = query.execute()

    pantries = result.data or []
    total = result.count if getattr(result, "count", None) is not None else len(pantries)

    return {
        "success": True,
        "data": pantries,
        "meta": {
            "total": total,
            "page": page,
            "limit": limit,
        },
    }


@pantry_router.put("/pantry/me")
async def update_my_pantry(
    payload: PantryUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_app_user),
):
    supabase = get_supabase_client()
    existing_pantry = fetch_owned_pantry(supabase, payload.pantry_id, current_user["id"])

    update_payload: Dict[str, Any] = {}

    if payload.name is not None:
        cleaned = payload.name.strip()
        if not cleaned:
            error_response("name cannot be empty", "INVALID_NAME", 400)
        update_payload["name"] = cleaned

    if payload.description is not None:
        update_payload["description"] = payload.description.strip() if payload.description else None

    if payload.address is not None:
        cleaned = payload.address.strip()
        if not cleaned:
            error_response("address cannot be empty", "INVALID_ADDRESS", 400)
        update_payload["address"] = cleaned

    if payload.latitude is not None:
        update_payload["latitude"] = payload.latitude

    if payload.longitude is not None:
        update_payload["longitude"] = payload.longitude

    if payload.phone is not None:
        update_payload["phone"] = payload.phone.strip() if payload.phone else None

    if payload.website is not None:
        update_payload["website"] = payload.website.strip() if payload.website else None

    if payload.hours is not None:
        existing_hours = existing_pantry.get("hours")
        if not isinstance(existing_hours, dict):
            existing_hours = {}
        update_payload["hours"] = {**existing_hours, **payload.hours}

    if payload.services is not None:
        update_payload["services"] = normalize_and_validate_services(payload.services)

    if not update_payload:
        error_response("No update fields provided", "NO_UPDATES", 400)

    update_result = (
        supabase.table("food_pantries")
        .update(update_payload)
        .eq("id", payload.pantry_id)
        .eq("owner_id", current_user["id"])
        .select(
            "id, owner_id, name, description, address, latitude, longitude, phone, website, "
            "hours, services, is_verified, created_at"
        )
        .execute()
    )

    updated_rows = update_result.data or []
    if not updated_rows:
        error_response("Pantry not found or not owned by user", "PANTRY_NOT_FOUND", 404)

    return success_response({"pantry": updated_rows[0]})


@pantry_router.get("/pantry/me/campaigns")
async def get_my_pantry_campaigns(
    pantry_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_app_user),
):
    supabase = get_supabase_client()
    offset = (page - 1) * limit

    owned_pantries_result = (
        get_pantry_list_query(supabase)
        .eq("owner_id", current_user["id"])
        .execute()
    )
    owned_pantries = owned_pantries_result.data or []

    pantry_ids = [p["id"] for p in owned_pantries if p.get("id")]
    if pantry_id:
        if pantry_id not in pantry_ids:
            error_response("Pantry not found or not owned by user", "PANTRY_NOT_FOUND", 404)
        pantry_ids = [pantry_id]

    if not pantry_ids:
        return {
            "success": True,
            "data": [],
            "meta": {"total": 0, "page": page, "limit": limit},
        }

    count_result = (
        supabase.table("campaigns")
        .select("id", count="exact")
        .in_("food_pantry_id", pantry_ids)
        .execute()
    )
    total = count_result.count if getattr(count_result, "count", None) is not None else 0

    campaigns_result = (
        supabase.table("campaigns")
        .select("id, title, date, status, food_pantry_id, location, address")
        .in_("food_pantry_id", pantry_ids)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    campaigns = campaigns_result.data or []

    return {
        "success": True,
        "data": campaigns,
        "meta": {"total": total, "page": page, "limit": limit},
    }


@pantry_router.post("/pantry/me/campaigns/{id}/link")
async def link_campaign_to_my_pantry(
    id: str,
    payload: PantryCampaignLinkRequest,
    current_user: Dict[str, Any] = Depends(get_current_app_user),
):
    supabase = get_supabase_client()
    target_pantry = fetch_owned_pantry(supabase, payload.pantry_id, current_user["id"])

    campaign_result = (
        supabase.table("campaigns")
        .select("id, title, status, food_pantry_id, updated_at")
        .eq("id", id)
        .limit(1)
        .execute()
    )
    campaign_rows = campaign_result.data or []
    if not campaign_rows:
        error_response("Campaign not found", "CAMPAIGN_NOT_FOUND", 404)

    campaign = campaign_rows[0]
    existing_link = campaign.get("food_pantry_id")
    if existing_link and existing_link != target_pantry["id"]:
        error_response(
            "Campaign is already linked to a different pantry",
            "CAMPAIGN_ALREADY_LINKED",
            409,
        )

    if existing_link == target_pantry["id"]:
        return success_response(
            {
                "campaign_id": campaign["id"],
                "food_pantry_id": target_pantry["id"],
                "status": campaign.get("status"),
            }
        )

    now_utc_iso = datetime.now(timezone.utc).isoformat()
    update_result = (
        supabase.table("campaigns")
        .update({"food_pantry_id": target_pantry["id"], "updated_at": now_utc_iso})
        .eq("id", id)
        .select("id, title, status, food_pantry_id, updated_at")
        .execute()
    )

    updated_rows = update_result.data or []
    if not updated_rows:
        error_response("Failed to link campaign", "LINK_FAILED", 500)

    return success_response({"campaign": updated_rows[0]})


@pantry_router.get("/pantries")
async def list_public_pantries(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    supabase = get_supabase_client()
    offset = (page - 1) * limit

    result = (
        supabase.table("food_pantries")
        .select(
            "id, name, description, address, latitude, longitude, phone, website, services, is_verified",
            count="exact",
        )
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    pantries = result.data or []
    total = result.count if getattr(result, "count", None) is not None else len(pantries)

    return {
        "success": True,
        "data": pantries,
        "meta": {"total": total, "page": page, "limit": limit},
    }


@pantry_router.get("/pantries/{pantry_id}")
async def get_public_pantry_by_id(pantry_id: str):
    supabase = get_supabase_client()

    pantry_result = (
        supabase.table("food_pantries")
        .select(
            "id, name, description, address, latitude, longitude, phone, website, hours, services, is_verified"
        )
        .eq("id", pantry_id)
        .limit(1)
        .execute()
    )

    pantry_rows = pantry_result.data or []
    if not pantry_rows:
        error_response("Pantry not found", "PANTRY_NOT_FOUND", 404)

    linked_campaigns_result = (
        supabase.table("campaigns")
        .select("id, title, date, status")
        .eq("food_pantry_id", pantry_id)
        .order("date", desc=False)
        .execute()
    )

    pantry = pantry_rows[0]
    pantry["linked_campaigns"] = linked_campaigns_result.data or []

    return success_response({"pantry": pantry})


@admin_campaign_router.get("/users")
async def get_admin_users(
    sort: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    _: Dict[str, Any] = Depends(require_admin),
):
    if sort and sort not in VALID_USER_SORT_FIELDS:
        error_response("Invalid sort field", "INVALID_SORT", 400)

    supabase = get_supabase_client()

    users_query = (
        supabase.table("users")
        .select("id, name, email, role, created_at")
        .order("created_at", desc=True)
        .limit(MAX_RESULTS)
    )

    if role:
        users_query = users_query.eq("role", role)

    users_result = users_query.execute()
    users = users_result.data or []

    user_ids = [user.get("id") for user in users if user.get("id")]
    points_by_user: Dict[str, int] = {}

    if user_ids:
        points_result = (
            supabase.table("user_points")
            .select("user_id, points")
            .in_("user_id", user_ids)
            .execute()
        )
        for row in points_result.data or []:
            user_id = row.get("user_id")
            points = row.get("points", 0) or 0
            if not user_id:
                continue
            if isinstance(points, (int, float)):
                points_by_user[user_id] = points_by_user.get(user_id, 0) + int(points)

    response_users = [
        {
            "id": user.get("id"),
            "name": user.get("name"),
            "email": user.get("email"),
            "role": user.get("role"),
            "created_at": user.get("created_at"),
            "total_points": points_by_user.get(user.get("id"), 0),
        }
        for user in users
    ]

    if sort == "points":
        response_users.sort(key=lambda user: user["total_points"], reverse=True)

    return success_response(
        {"users": response_users},
        meta={"total": len(response_users), "limit": MAX_RESULTS},
    )


@admin_campaign_router.get("/campaigns")
async def get_admin_campaigns(
    status: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    _: Dict[str, Any] = Depends(require_admin),
):
    if date_from and date_to and date_from > date_to:
        error_response("date_from must be on or before date_to", "INVALID_DATE_RANGE", 400)

    if status and status not in VALID_CAMPAIGN_STATUSES:
        error_response("Invalid campaign status", "INVALID_STATUS", 400)

    supabase = get_supabase_client()

    campaign_query = (
        supabase.table("campaigns")
        .select(
            "id, organizer_id, title, description, location, address, date, start_time, end_time, "
            "status, max_volunteers, target_flyers, flyer_template_id, food_pantry_id, latitude, longitude, "
            "promoted_at, promoted_until, tags, created_at, updated_at"
        )
        .order("created_at", desc=True)
        .limit(MAX_RESULTS)
    )

    if status:
        campaign_query = campaign_query.eq("status", status)
    if date_from:
        campaign_query = campaign_query.gte("date", date_from.isoformat())
    if date_to:
        campaign_query = campaign_query.lte("date", date_to.isoformat())

    campaigns_result = campaign_query.execute()
    campaigns = campaigns_result.data or []

    campaign_ids = [campaign.get("id") for campaign in campaigns if campaign.get("id")]
    signup_counts: Dict[str, int] = {}

    if campaign_ids:
        signups_result = (
            supabase.table("signups")
            .select("campaign_id")
            .in_("campaign_id", campaign_ids)
            .execute()
        )
        signup_counts = count_signups_by_campaign(signups_result.data or [])

    response_campaigns = []
    for campaign in campaigns:
        campaign_id = campaign.get("id")
        response_campaigns.append(
            {
                **campaign,
                "signup_count": signup_counts.get(campaign_id, 0),
            }
        )

    return success_response(
        {"campaigns": response_campaigns},
        meta={"total": len(response_campaigns), "limit": MAX_RESULTS},
    )


@admin_campaign_router.get("/campaigns/{campaign_id}")
async def get_admin_campaign_by_id(
    campaign_id: str,
    _: Dict[str, Any] = Depends(require_admin),
):
    supabase = get_supabase_client()

    campaign_result = (
        supabase.table("campaigns")
        .select(
            "id, organizer_id, title, description, location, address, date, start_time, end_time, "
            "status, max_volunteers, target_flyers, flyer_template_id, food_pantry_id, latitude, longitude, "
            "promoted_at, promoted_until, tags, created_at, updated_at"
        )
        .eq("id", campaign_id)
        .limit(1)
        .execute()
    )

    campaign_rows = campaign_result.data or []
    if not campaign_rows:
        error_response("Campaign not found", "CAMPAIGN_NOT_FOUND", 404)

    campaign = campaign_rows[0]

    organizer = None
    organizer_id = campaign.get("organizer_id")
    if organizer_id:
        organizer_result = (
            supabase.table("users")
            .select("id, name, email, role")
            .eq("id", organizer_id)
            .limit(1)
            .execute()
        )
        organizer_rows = organizer_result.data or []
        if organizer_rows:
            organizer = organizer_rows[0]

    tasks_result = (
        supabase.table("tasks")
        .select("id, campaign_id, title, description, assigned_to, max_assignees, created_at")
        .eq("campaign_id", campaign_id)
        .order("created_at", desc=False)
        .execute()
    )
    tasks = tasks_result.data or []

    signups_result = (
        supabase.table("signups")
        .select("id")
        .eq("campaign_id", campaign_id)
        .execute()
    )
    signup_count = len(signups_result.data or [])

    campaign_data = {
        **campaign,
        "organizer": organizer,
    }

    return success_response(
        {
            "campaign": campaign_data,
            "tasks": tasks,
            "signup_count": signup_count,
        }
    )


@admin_campaign_router.put("/campaigns/{campaign_id}/status")
async def update_admin_campaign_status(
    campaign_id: str,
    payload: CampaignStatusUpdateRequest,
    _: Dict[str, Any] = Depends(require_admin),
):
    new_status = payload.status.strip().lower()
    if new_status not in VALID_CAMPAIGN_STATUSES:
        error_response("Invalid campaign status", "INVALID_STATUS", 400)

    supabase = get_supabase_client()

    now_utc_iso = datetime.now(timezone.utc).isoformat()
    update_result = (
        supabase.table("campaigns")
        .update(
            {
                "status": new_status,
                "updated_at": now_utc_iso,
            }
        )
        .eq("id", campaign_id)
        .select("id, status, updated_at")
        .execute()
    )

    updated_rows = update_result.data or []
    if not updated_rows:
        error_response("Campaign not found", "CAMPAIGN_NOT_FOUND", 404)

    updated = updated_rows[0]

    return success_response(
        {
            "campaign_id": updated.get("id"),
            "status": updated.get("status"),
            "updated_at": updated.get("updated_at"),
        }
    )


@admin_campaign_router.get("/flyer-templates")
async def get_admin_flyer_templates(
    _: Dict[str, Any] = Depends(require_admin),
):
    supabase = get_supabase_client()

    templates_result = (
        supabase.table("flyer_templates")
        .select("id, name, file_url, thumbnail_url, customizable_fields, is_active, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    templates = templates_result.data or []

    return success_response(
        {"flyer_templates": templates},
        meta={"total": len(templates)},
    )


@admin_campaign_router.post("/flyer-templates")
async def create_admin_flyer_template(
    payload: FlyerTemplateCreateRequest,
    _: Dict[str, Any] = Depends(require_admin),
):
    name = payload.name.strip()
    file_url = payload.file_url.strip()

    if not name:
        error_response("name is required", "INVALID_NAME", 400)
    if not file_url:
        error_response("file_url is required", "INVALID_FILE_URL", 400)

    insert_payload = {
        "name": name,
        "file_url": file_url,
        "thumbnail_url": payload.thumbnail_url.strip() if payload.thumbnail_url else None,
        "customizable_fields": payload.customizable_fields or {},
        "is_active": payload.is_active,
    }

    supabase = get_supabase_client()
    create_result = (
        supabase.table("flyer_templates")
        .insert(insert_payload)
        .select("id, name, file_url, thumbnail_url, customizable_fields, is_active, created_at")
        .execute()
    )

    created_rows = create_result.data or []
    if not created_rows:
        error_response("Failed to create flyer template", "CREATE_FAILED", 500)

    return success_response({"flyer_template": created_rows[0]})


@admin_campaign_router.put("/flyer-templates/{template_id}")
async def update_admin_flyer_template(
    template_id: str,
    payload: FlyerTemplateUpdateRequest,
    _: Dict[str, Any] = Depends(require_admin),
):
    update_payload: Dict[str, Any] = {}

    if payload.name is not None:
        cleaned_name = payload.name.strip()
        if not cleaned_name:
            error_response("name cannot be empty", "INVALID_NAME", 400)
        update_payload["name"] = cleaned_name

    if payload.file_url is not None:
        cleaned_file_url = payload.file_url.strip()
        if not cleaned_file_url:
            error_response("file_url cannot be empty", "INVALID_FILE_URL", 400)
        update_payload["file_url"] = cleaned_file_url

    if payload.thumbnail_url is not None:
        update_payload["thumbnail_url"] = payload.thumbnail_url.strip() or None

    if payload.customizable_fields is not None:
        update_payload["customizable_fields"] = payload.customizable_fields

    if payload.is_active is not None:
        update_payload["is_active"] = payload.is_active

    if not update_payload:
        error_response("No update fields provided", "NO_UPDATES", 400)

    supabase = get_supabase_client()
    update_result = (
        supabase.table("flyer_templates")
        .update(update_payload)
        .eq("id", template_id)
        .select("id, name, file_url, thumbnail_url, customizable_fields, is_active, created_at")
        .execute()
    )

    updated_rows = update_result.data or []
    if not updated_rows:
        error_response("Flyer template not found", "TEMPLATE_NOT_FOUND", 404)

    return success_response({"flyer_template": updated_rows[0]})


@admin_campaign_router.delete("/flyer-templates/{template_id}")
async def delete_admin_flyer_template(
    template_id: str,
    _: Dict[str, Any] = Depends(require_admin),
):
    supabase = get_supabase_client()

    # Soft delete for hackathon safety.
    delete_result = (
        supabase.table("flyer_templates")
        .update({"is_active": False})
        .eq("id", template_id)
        .select("id, is_active")
        .execute()
    )

    deleted_rows = delete_result.data or []
    if not deleted_rows:
        error_response("Flyer template not found", "TEMPLATE_NOT_FOUND", 404)

    return success_response(
        {
            "template_id": deleted_rows[0].get("id"),
            "is_active": deleted_rows[0].get("is_active"),
        }
    )


@admin_campaign_router.get("/food-pantries")
async def get_admin_food_pantries(
    _: Dict[str, Any] = Depends(require_admin),
):
    supabase = get_supabase_client()

    pantries_result = (
        supabase.table("food_pantries")
        .select(
            "id, owner_id, name, description, address, latitude, longitude, phone, website, "
            "hours, services, is_verified, created_at"
        )
        .order("created_at", desc=True)
        .limit(MAX_RESULTS)
        .execute()
    )
    pantries = pantries_result.data or []

    return success_response(
        {"food_pantries": pantries},
        meta={"total": len(pantries), "limit": MAX_RESULTS},
    )


@admin_campaign_router.put("/food-pantries/{pantry_id}/verify")
async def verify_admin_food_pantry(
    pantry_id: str,
    payload: PantryVerifyRequest,
    _: Dict[str, Any] = Depends(require_admin),
):
    supabase = get_supabase_client()

    update_result = (
        supabase.table("food_pantries")
        .update({"is_verified": payload.is_verified})
        .eq("id", pantry_id)
        .select(
            "id, owner_id, name, description, address, latitude, longitude, phone, website, "
            "hours, services, is_verified, created_at"
        )
        .execute()
    )

    updated_rows = update_result.data or []
    if not updated_rows:
        error_response("Food pantry not found", "PANTRY_NOT_FOUND", 404)

    return success_response({"food_pantry": updated_rows[0]})


@admin_analytics_router.get("/overview")
async def get_admin_analytics_overview(
    _: Dict[str, Any] = Depends(require_admin),
):
    supabase = get_supabase_client()

    campaigns_result = (
        supabase.table("campaigns")
        .select("id, status, date, created_at")
        .execute()
    )
    campaigns = campaigns_result.data or []

    volunteers_result = (
        supabase.table("users")
        .select("id")
        .eq("role", "volunteer")
        .execute()
    )
    volunteers = volunteers_result.data or []

    impact_result = (
        supabase.table("impact_reports")
        .select("flyers_distributed, families_reached")
        .execute()
    )
    impact_reports = impact_result.data or []

    today = date.today()
    month_start = date(today.year, today.month, 1)

    campaigns_this_month = 0
    active_campaigns = 0

    for campaign in campaigns:
        created_at = parse_datetime_safe(campaign.get("created_at"))
        if created_at and to_utc(created_at).date() >= month_start:
            campaigns_this_month += 1

        campaign_date = parse_date_safe(campaign.get("date"))
        status = str(campaign.get("status", "")).lower()
        if campaign_date and campaign_date >= today and status in {"published", "active"}:
            active_campaigns += 1

    data = {
        "total_campaigns": len(campaigns),
        "total_volunteers": len(volunteers),
        "total_flyers_distributed": summarize_int_field(impact_reports, "flyers_distributed"),
        "total_families_reached": summarize_int_field(impact_reports, "families_reached"),
        "campaigns_this_month": campaigns_this_month,
        "active_campaigns": active_campaigns,
    }

    return success_response(data)


@admin_analytics_router.get("/trends")
async def get_admin_analytics_trends(
    period: str = Query("weekly", pattern="^(weekly|monthly)$"),
    _: Dict[str, Any] = Depends(require_admin),
):
    supabase = get_supabase_client()

    campaigns_result = supabase.table("campaigns").select("created_at").execute()
    signups_result = supabase.table("signups").select("joined_at").execute()
    impact_result = (
        supabase.table("impact_reports")
        .select("submitted_at, flyers_distributed, families_reached")
        .execute()
    )
    points_result = supabase.table("user_points").select("awarded_at, points").execute()

    campaigns = campaigns_result.data or []
    signups = signups_result.data or []
    impact_reports = impact_result.data or []
    user_points = points_result.data or []

    today = date.today()
    bucket_count = 12

    if period == "weekly":
        start_bucket = get_week_start(today) - timedelta(weeks=bucket_count - 1)
        bucket_starts = [start_bucket + timedelta(weeks=i) for i in range(bucket_count)]

        def bucket_key_from_datetime(dt: datetime) -> date:
            return get_week_start(to_utc(dt).date())

        label_format = lambda d: d.isoformat()
    else:
        start_bucket = add_months(get_month_start(today), -(bucket_count - 1))
        bucket_starts = [add_months(start_bucket, i) for i in range(bucket_count)]

        def bucket_key_from_datetime(dt: datetime) -> date:
            return get_month_start(to_utc(dt).date())

        label_format = lambda d: d.strftime("%Y-%m")

    bucket_set = set(bucket_starts)
    series: Dict[date, Dict[str, Any]] = {
        b: {
            "period_start": b.isoformat(),
            "label": label_format(b),
            "campaigns_created": 0,
            "new_signups": 0,
            "flyers_distributed": 0,
            "families_reached": 0,
            "points_awarded": 0,
        }
        for b in bucket_starts
    }

    for campaign in campaigns:
        created_at = parse_datetime_safe(campaign.get("created_at"))
        if not created_at:
            continue
        bucket = bucket_key_from_datetime(created_at)
        if bucket in bucket_set:
            series[bucket]["campaigns_created"] += 1

    for signup in signups:
        joined_at = parse_datetime_safe(signup.get("joined_at"))
        if not joined_at:
            continue
        bucket = bucket_key_from_datetime(joined_at)
        if bucket in bucket_set:
            series[bucket]["new_signups"] += 1

    for report in impact_reports:
        submitted_at = parse_datetime_safe(report.get("submitted_at"))
        if not submitted_at:
            continue
        bucket = bucket_key_from_datetime(submitted_at)
        if bucket in bucket_set:
            flyers = report.get("flyers_distributed", 0) or 0
            families = report.get("families_reached", 0) or 0
            if isinstance(flyers, (int, float)):
                series[bucket]["flyers_distributed"] += int(flyers)
            if isinstance(families, (int, float)):
                series[bucket]["families_reached"] += int(families)

    for points_row in user_points:
        awarded_at = parse_datetime_safe(points_row.get("awarded_at"))
        if not awarded_at:
            continue
        bucket = bucket_key_from_datetime(awarded_at)
        if bucket in bucket_set:
            points = points_row.get("points", 0) or 0
            if isinstance(points, (int, float)):
                series[bucket]["points_awarded"] += int(points)

    trends = [series[b] for b in bucket_starts]

    return success_response(
        {
            "period": period,
            "buckets": trends,
        }
    )


@admin_analytics_router.get("/impact-map")
async def get_admin_impact_map(
    _: Dict[str, Any] = Depends(require_admin),
):
    supabase = get_supabase_client()

    campaigns_result = (
        supabase.table("campaigns")
        .select("id, title, latitude, longitude, status, date")
        .execute()
    )
    campaigns = campaigns_result.data or []

    if not campaigns:
        return success_response({"points": []})

    campaign_lookup: Dict[str, Dict[str, Any]] = {}
    campaign_ids: List[str] = []

    for campaign in campaigns:
        campaign_id = campaign.get("id")
        if not campaign_id:
            continue
        campaign_lookup[campaign_id] = campaign
        campaign_ids.append(campaign_id)

    impact_result = (
        supabase.table("impact_reports")
        .select("campaign_id, flyers_distributed, families_reached, volunteers_attended, submitted_at")
        .in_("campaign_id", campaign_ids)
        .execute()
    )
    impact_reports = impact_result.data or []

    report_by_campaign = {
        report.get("campaign_id"): report
        for report in impact_reports
        if report.get("campaign_id")
    }

    points: List[Dict[str, Any]] = []

    for campaign_id in campaign_ids:
        campaign = campaign_lookup.get(campaign_id)
        if not campaign:
            continue

        report = report_by_campaign.get(campaign_id, {})

        try:
            latitude = float(campaign["latitude"])
            longitude = float(campaign["longitude"])
        except (TypeError, ValueError, KeyError):
            continue

        flyers_distributed = report.get("flyers_distributed", 0) or 0
        families_reached = report.get("families_reached", 0) or 0
        volunteers_attended = report.get("volunteers_attended", 0) or 0

        points.append(
            {
                "campaign_id": campaign_id,
                "title": campaign.get("title"),
                "latitude": latitude,
                "longitude": longitude,
                "status": campaign.get("status"),
                "date": campaign.get("date"),
                "flyers_distributed": int(flyers_distributed) if isinstance(flyers_distributed, (int, float)) else 0,
                "families_reached": int(families_reached) if isinstance(families_reached, (int, float)) else 0,
                "volunteers_attended": int(volunteers_attended) if isinstance(volunteers_attended, (int, float)) else 0,
                "has_impact_report": bool(report),
            }
        )

    limited_points = points[:MAX_RESULTS]

    return success_response(
        {
            "points": limited_points,
        },
        meta={
            "total": len(limited_points),
            "limit": MAX_RESULTS,
        },
    )


@router.get("/campaigns")
async def get_map_campaigns(
    lat: float = Query(..., description="User latitude"),
    lng: float = Query(..., description="User longitude"),
    radius_km: float = Query(..., gt=0, description="Search radius in kilometers"),
    status: str = Query("published", description="Campaign status filter"),
):
    supabase = get_supabase_client()

    campaign_result = (
        supabase.table("campaigns")
        .select("id, title, latitude, longitude, date, end_time, max_volunteers, status")
        .eq("status", status)
        .execute()
    )

    campaigns = campaign_result.data or []

    filtered_campaigns: List[Dict[str, Any]] = []
    campaign_ids: List[str] = []

    for campaign in campaigns:
        campaign_lat = campaign.get("latitude")
        campaign_lng = campaign.get("longitude")

        if campaign_lat is None or campaign_lng is None:
            continue

        if is_campaign_expired(campaign):
            continue

        try:
            distance_km = haversine_km(
                lat,
                lng,
                float(campaign_lat),
                float(campaign_lng),
            )
        except (TypeError, ValueError):
            continue

        if distance_km > radius_km:
            continue

        campaign["distance_km"] = distance_km
        filtered_campaigns.append(campaign)
        campaign_ids.append(campaign["id"])

    signup_counts: Dict[str, int] = {}

    if campaign_ids:
        signup_result = (
            supabase.table("signups")
            .select("campaign_id")
            .in_("campaign_id", campaign_ids)
            .execute()
        )
        signup_counts = count_signups_by_campaign(signup_result.data or [])

    filtered_campaigns.sort(key=lambda row: row["distance_km"])
    filtered_campaigns = filtered_campaigns[:MAX_RESULTS]

    campaign_pins = [
        {
            "id": campaign["id"],
            "title": campaign["title"],
            "latitude": float(campaign["latitude"]),
            "longitude": float(campaign["longitude"]),
            "date": campaign["date"],
            "signup_count": signup_counts.get(campaign["id"], 0),
            "max_volunteers": campaign.get("max_volunteers"),
            "status": campaign["status"],
        }
        for campaign in filtered_campaigns
    ]

    return success_response(
        {"campaigns": campaign_pins},
        meta={
            "total": len(campaign_pins),
            "limit": MAX_RESULTS,
        },
    )


@router.get("/food-pantries")
async def get_map_food_pantries(
    lat: float = Query(..., description="User latitude"),
    lng: float = Query(..., description="User longitude"),
    radius_km: float = Query(..., gt=0, description="Search radius in kilometers"),
):
    supabase = get_supabase_client()

    pantry_result = (
        supabase.table("food_pantries")
        .select("id, name, latitude, longitude, is_verified")
        .eq("is_verified", True)
        .execute()
    )

    pantries = pantry_result.data or []

    nearby_pantries: List[Dict[str, Any]] = []

    for pantry in pantries:
        pantry_lat = pantry.get("latitude")
        pantry_lng = pantry.get("longitude")

        if pantry_lat is None or pantry_lng is None:
            continue

        try:
            distance_km = haversine_km(
                lat,
                lng,
                float(pantry_lat),
                float(pantry_lng),
            )
        except (TypeError, ValueError):
            continue

        if distance_km > radius_km:
            continue

        pantry["distance_km"] = distance_km
        nearby_pantries.append(pantry)

    nearby_pantries.sort(key=lambda row: row["distance_km"])
    nearby_pantries = nearby_pantries[:MAX_RESULTS]

    pantry_pins = [
        {
            "id": pantry["id"],
            "name": pantry["name"],
            "latitude": float(pantry["latitude"]),
            "longitude": float(pantry["longitude"]),
            "is_verified": pantry["is_verified"],
        }
        for pantry in nearby_pantries
    ]

    return success_response(
        {"pantries": pantry_pins},
        meta={
            "total": len(pantry_pins),
            "limit": MAX_RESULTS,
        },
    )


@router.get("/heatmap")
async def get_impact_heatmap(
    start: date = Query(..., description="Start date, YYYY-MM-DD"),
    end: date = Query(..., description="End date, YYYY-MM-DD"),
    _: Dict[str, Any] = Depends(require_admin),
):
    if start > end:
        error_response("start must be on or before end", "INVALID_DATE_RANGE", 400)

    supabase = get_supabase_client()

    # Using campaign date here, since it is the event date users/admins care about.
    campaign_result = (
        supabase.table("campaigns")
        .select("id, latitude, longitude, date")
        .gte("date", start.isoformat())
        .lte("date", end.isoformat())
        .execute()
    )

    campaigns = campaign_result.data or []

    campaign_lookup: Dict[str, Dict[str, Any]] = {}
    campaign_ids: List[str] = []

    for campaign in campaigns:
        if campaign.get("latitude") is None or campaign.get("longitude") is None:
            continue

        campaign_lookup[campaign["id"]] = campaign
        campaign_ids.append(campaign["id"])

    if not campaign_ids:
        return success_response(
            {"points": []},
            meta={"total": 0, "limit": MAX_RESULTS},
        )

    impact_result = (
        supabase.table("impact_reports")
        .select("campaign_id, families_reached")
        .in_("campaign_id", campaign_ids)
        .execute()
    )

    impact_reports = impact_result.data or []

    points: List[Dict[str, Any]] = []

    for report in impact_reports:
        campaign_id = report.get("campaign_id")
        campaign = campaign_lookup.get(campaign_id)

        if not campaign:
            continue

        families_reached = report.get("families_reached", 0) or 0

        points.append(
            {
                "latitude": float(campaign["latitude"]),
                "longitude": float(campaign["longitude"]),
                "weight": families_reached,
            }
        )

    points = points[:MAX_RESULTS]

    return success_response(
        {"points": points},
        meta={
            "total": len(points),
            "limit": MAX_RESULTS,
            "metric": "families_reached",
        },
    )
