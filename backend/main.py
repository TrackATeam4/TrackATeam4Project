from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import Any, Dict, Optional

from agent_app.chat_agent import run_turn
from auth import get_current_user
from agent_app.chat_service import VALID_CONTEXT_FIELDS, chat_store
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


class ChatMessageRequest(BaseModel):
    session_id: str
    message: str


class SaveContextRequest(BaseModel):
    field: str
    value: Any


class GenerateFlyerRequest(BaseModel):
    template_id: Optional[str] = None


def _extract_user_id(user: Any) -> str:
    if isinstance(user, dict):
        nested = user.get("user")
        if isinstance(nested, dict) and nested.get("id"):
            return str(nested["id"])
        if user.get("id"):
            return str(user["id"])

    nested_obj = getattr(user, "user", None)
    nested_id = getattr(nested_obj, "id", None)
    if nested_id:
        return str(nested_id)

    direct_id = getattr(user, "id", None)
    if direct_id:
        return str(direct_id)

    raise HTTPException(status_code=401, detail="Unable to determine user id from token")


def _extract_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    return authorization.replace("Bearer ", "", 1)


def _get_session_or_404(session_id: str, user_id: str) -> Dict[str, Any]:
    try:
        return chat_store.get_session(session_id=session_id, user_id=user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")


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
        response = supabase.auth.sign_up({"email": request.email, "password": request.password})
        return {"message": "Sign up successful", "user": response.user}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/signin")
async def sign_in(request: SignInRequest):
    try:
        supabase = get_supabase_client()
        response = supabase.auth.sign_in_with_password({"email": request.email, "password": request.password})
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


@app.post("/chat/session")
async def create_chat_session(user=Depends(get_current_user)):
    user_id = _extract_user_id(user)
    session = chat_store.create_session(user_id=user_id)
    return {
        "success": True,
        "data": {
            "session_id": session["session_id"],
            "context": session["context"],
        },
    }


@app.get("/chat/session/{session_id}")
async def get_chat_session(session_id: str, user=Depends(get_current_user)):
    user_id = _extract_user_id(user)
    session = _get_session_or_404(session_id=session_id, user_id=user_id)
    return {
        "success": True,
        "data": {
            "session_id": session["session_id"],
            "status": session["status"],
            "context": session["context"],
            "messages": session["messages"],
        },
    }


@app.post("/chat/message")
async def chat_message(
    body: ChatMessageRequest,
    user=Depends(get_current_user),
    authorization: Optional[str] = Header(None),
):
    user_id = _extract_user_id(user)
    token = _extract_token(authorization)
    session = _get_session_or_404(session_id=body.session_id, user_id=user_id)

    chat_store.append_message(session, "user", body.message)
    result = run_turn(
        session_id=body.session_id,
        user_message=body.message,
        chat_history=session["messages"],
        token=token,
    )

    chat_store.append_message(session, "assistant", result["reply"])

    return {
        "success": True,
        "data": {
            "reply": result["reply"],
            "context": result["context"],
            "action": result["action"],
        },
    }


@app.post("/chat/message/stream")
async def stream_message(
    body: ChatMessageRequest,
    user=Depends(get_current_user),
    authorization: Optional[str] = Header(None),
):
    user_id = _extract_user_id(user)
    token = _extract_token(authorization)
    session = _get_session_or_404(session_id=body.session_id, user_id=user_id)

    chat_store.append_message(session, "user", body.message)
    result = run_turn(
        session_id=body.session_id,
        user_message=body.message,
        chat_history=session["messages"],
        token=token,
    )
    chat_store.append_message(session, "assistant", result["reply"])

    def token_generator():
        for word in result["reply"].split(" "):
            yield f"data: {word} \n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(token_generator(), media_type="text/event-stream")


@app.post("/chat/session/{session_id}/context")
async def save_chat_context(
    session_id: str,
    body: SaveContextRequest,
    user=Depends(get_current_user),
):
    user_id = _extract_user_id(user)
    session = _get_session_or_404(session_id=session_id, user_id=user_id)

    if body.field not in VALID_CONTEXT_FIELDS:
        raise HTTPException(status_code=400, detail=f"Invalid field '{body.field}'")

    try:
        context = chat_store.save_context_field(session=session, field=body.field, value=body.value)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "data": {"context": context}}


@app.get("/chat/session/{session_id}/check-conflicts")
async def check_session_conflicts(session_id: str, user=Depends(get_current_user)):
    user_id = _extract_user_id(user)
    session = _get_session_or_404(session_id=session_id, user_id=user_id)
    return {"success": True, "data": chat_store.check_conflicts(session)}


@app.get("/chat/session/{session_id}/suggest-pantries")
async def suggest_session_pantries(session_id: str, user=Depends(get_current_user)):
    user_id = _extract_user_id(user)
    session = _get_session_or_404(session_id=session_id, user_id=user_id)
    pantries = chat_store.suggest_pantries(session)
    return {"success": True, "data": {"pantries": pantries}}


@app.post("/chat/session/{session_id}/create-campaign")
async def create_session_campaign(session_id: str, user=Depends(get_current_user)):
    user_id = _extract_user_id(user)
    session = _get_session_or_404(session_id=session_id, user_id=user_id)

    try:
        campaign = chat_store.create_campaign(session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "data": campaign}


@app.post("/chat/session/{session_id}/generate-flyer")
async def generate_session_flyer(
    session_id: str,
    body: Optional[GenerateFlyerRequest] = None,
    user=Depends(get_current_user),
):
    user_id = _extract_user_id(user)
    session = _get_session_or_404(session_id=session_id, user_id=user_id)
    template_id = body.template_id if body else None

    try:
        flyer = chat_store.generate_flyer(session, template_id=template_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "data": flyer}
