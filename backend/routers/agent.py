"""Agent router for Bedrock-based campaign builder."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from agent.agent import run_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)


class ChatResponse(BaseModel):
    response: str
    tool_calls: list[dict] = []


@router.post("/chat", response_model=ChatResponse)
async def agent_chat(request: ChatRequest, user=Depends(get_current_user)):
    """Main chat endpoint for the Campaign Builder Agent."""
    try:
        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in request.messages
        ]

        result = await run_agent(messages, user_id=user.user.id)

        return ChatResponse(
            response=result.get("content", ""),
            tool_calls=result.get("tool_calls", []),
        )
    except Exception as exc:
        logger.error("Agent error: %s", exc)
        raise HTTPException(status_code=500, detail="Agent request failed")
