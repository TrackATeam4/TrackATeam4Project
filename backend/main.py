from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from auth import get_current_user
from supabase_client import get_supabase_client
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from routes.map import router as map_router, pantry_router, admin_analytics_router, admin_campaign_router

app = FastAPI(title="TrackA API", version="1.0.0")

app.include_router(map_router)
app.include_router(pantry_router)
app.include_router(admin_analytics_router)
app.include_router(admin_campaign_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str


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
async def sign_up(request: SignUpRequest):
    try:
        supabase = get_supabase_client()
        response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password
        })
        return {"message": "Sign up successful", "user": response.user}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/signin")
async def sign_in(request: SignInRequest):
    try:
        supabase = get_supabase_client()
        response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password
        })
        return {"message": "Sign in successful", "session": response.session, "user": response.user}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@app.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    try:
        supabase = get_supabase_client()
        supabase.auth.reset_password_for_email(request.email)
        return {"message": "Password reset email sent"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {"user": user}


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
