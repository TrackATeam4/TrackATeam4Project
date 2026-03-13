from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from auth import get_current_user
from supabase_client import get_supabase_client

app = FastAPI(title="TrackA API", version="1.0.0")

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
