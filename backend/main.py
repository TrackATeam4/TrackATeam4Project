from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

import logging
from auth import get_current_user
from supabase_client import get_supabase_client
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from routes.map import router as map_router, pantry_router, admin_analytics_router, admin_campaign_router
from routers import campaigns, impact, feed, promotion, leaderboard, chat, tasks, invitations, map
from importlib import import_module
from services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="TrackA API", version="1.0.0")

app.include_router(map_router)
app.include_router(pantry_router)
app.include_router(admin_analytics_router)
app.include_router(admin_campaign_router)


# Middleware must be added before routers for predictable ordering
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(campaigns.router)
app.include_router(impact.router)
app.include_router(feed.router)
app.include_router(promotion.router)
app.include_router(leaderboard.router)
app.include_router(chat.router)
app.include_router(tasks.router)
app.include_router(invitations.router)

# routers/map.py must come before routes/map.py; both define /map/food-pantries
# but routers/map.py returns {"data": [...]} (flat array) which the frontend expects.
# routes/map.py returns {"data": {"pantries": [...]}} (nested), which parseArrayData
# cannot handle and silently returns [].
app.include_router(map.router)
for optional_router_module in ("routers.bsky", "routers.flyers"):
    try:
        module = import_module(optional_router_module)
        app.include_router(module.router)
    except ModuleNotFoundError:
        logger.warning("Optional router module not found: %s", optional_router_module)

# Legacy map/pantry/admin routers; keep for admin endpoints not in routers/map.py
app.include_router(map_router)
app.include_router(pantry_router)
app.include_router(admin_analytics_router)
app.include_router(admin_campaign_router)


@app.on_event("startup")
def on_startup():
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown():
    stop_scheduler()


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Minimum 8 characters")


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr


@app.get("/")
def root():
    return {"message": "TrackA API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/signup")
async def sign_up(
    request: SignUpRequest,
    supabase=Depends(get_supabase_client),
):
    try:
        response = supabase.auth.sign_up(
            {
                "email": request.email,
                "password": request.password,
            }
        )
    except Exception as exc:
        logger.error("Signup failed for %s: %s", request.email, exc)
        raise HTTPException(status_code=400, detail="Sign up failed. Please try again.")

    auth_user = getattr(response, "user", None)
    user_id = getattr(auth_user, "id", None)
    user_email = getattr(auth_user, "email", None) or request.email

    if not user_id:
        logger.error("Signup succeeded but auth user ID missing for %s", request.email)
        raise HTTPException(
            status_code=500,
            detail="User created in auth, but failed to initialize profile.",
        )

    user_meta = getattr(auth_user, "user_metadata", {}) or {}
    display_name = (
        user_meta.get("full_name")
        or user_meta.get("name")
        or user_email.split("@")[0]
    )

    try:
        supabase.table("users").upsert(
            {
                "id": user_id,
                "email": user_email,
                "name": display_name,
                "role": "volunteer",
            },
            on_conflict="id",
        ).execute()
    except Exception as exc:
        logger.error("Failed creating profile row for %s (%s): %s", request.email, user_id, exc)
        raise HTTPException(
            status_code=500,
            detail="User created in auth, but failed to initialize profile.",
        )

    return {"message": "Sign up successful", "user": auth_user}


@app.post("/auth/signin")
async def sign_in(request: SignInRequest):
    try:
        supabase = get_supabase_client()
        response = supabase.auth.sign_in_with_password(
            {
                "email": request.email,
                "password": request.password,
            }
        )
        return {
            "message": "Sign in successful",
            "session": response.session,
            "user": response.user,
        }
    except Exception as exc:
        logger.error("Signin failed for %s: %s", request.email, exc)
        raise HTTPException(status_code=401, detail="Invalid email or password.")


@app.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    try:
        supabase = get_supabase_client()
        supabase.auth.reset_password_for_email(request.email)
        return {"message": "Password reset email sent"}
    except Exception as exc:
        logger.error("Password reset failed for %s: %s", request.email, exc)
        raise HTTPException(
            status_code=400, detail="Failed to send reset email. Please try again."
        )


@app.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    auth_user = getattr(user, "user", user)
    user_id = getattr(auth_user, "id", None)
    user_email = getattr(auth_user, "email", None)

    app_user = None
    try:
        supabase = get_supabase_client()
        query = supabase.table("users").select("id, email, name, role").limit(1)
        if user_id:
            result = query.eq("id", user_id).execute()
        elif user_email:
            result = query.eq("email", user_email).execute()
        else:
            result = None
        rows = (result.data if result else None) or []
        app_user = rows[0] if rows else None
    except Exception as exc:
        logger.warning("Could not load app user for /auth/me: %s", exc)

    return {
        "success": True,
        "data": {
            "id": (app_user or {}).get("id") or user_id,
            "email": (app_user or {}).get("email") or user_email,
            "name": (app_user or {}).get("name"),
            "role": (app_user or {}).get("role"),
            "user": {
                "id": user_id,
                "email": user_email,
            },
        },
    }


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    detail = exc.detail

    if isinstance(detail, dict) and {"success", "error", "code"} <= detail.keys():
        return JSONResponse(status_code=exc.status_code, content=detail)

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": str(detail),
            "code": "HTTP_ERROR",
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": "Invalid request parameters",
            "code": "VALIDATION_ERROR",
        },
    )


# Chat endpoints are provided by `routers/chat.py`.
