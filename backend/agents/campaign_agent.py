"""LangGraph-backed campaign agent with an AgentExecutor-compatible interface.

Exposes:
    build_agent_executor() -> _AgentExecutorCompat
    format_history(messages) -> list[BaseMessage]

Called lazily by routers/chat.py so the Bedrock client is only
instantiated when the first message arrives (not on server startup).
"""

from __future__ import annotations

import logging
import os

from langchain_aws import ChatBedrockConverse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from agents.tools import AGENT_TOOLS

logger = logging.getLogger(__name__)

def _is_bedrock_error(exc: Exception) -> bool:
    """Return True for any AWS Bedrock / boto3 error."""
    module = type(exc).__module__ or ""
    return (
        "botocore" in module
        or "boto3" in module
        or "langchain_aws" in module
        or type(exc).__name__ in {
            "AccessDeniedException",
            "ExpiredTokenException",
            "UnrecognizedClientException",
            "ResourceNotFoundException",
            "ValidationException",
            "ServiceUnavailableException",
            "ThrottlingException",
        }
    )

_SYSTEM_TEMPLATE = """\
You are a campaign creation assistant for Lemontree, a volunteer flyering platform.
Help organizers launch flyering campaigns step by step.

Current session:
  session_id: {session_id}
  auth_token:  {token}

Always pass exactly those values as session_id and token when calling tools.

Collect required fields one at a time (never ask for several at once):
  1. title        — short event name
  2. location     — neighbourhood / area
  3. address      — full street address
  4. date         — YYYY-MM-DD
  5. start_time   — HH:MM (24-hour)
  6. end_time     — HH:MM (24-hour)

Optional: max_volunteers, target_flyers.

Workflow:
  • Use save_event_field every time the user provides a value.
  • Once all required fields are collected, call check_conflicts.
    – If a conflict exists, warn the user and ask if they want to proceed.
  • Then call create_campaign followed immediately by generate_flyer.
  • Offer to send invitations using send_campaign_invite if they have contacts.

Be conversational, concise, and friendly. Never invent field values.\
"""


class _AgentExecutorCompat:
    """Wraps a LangGraph compiled graph to expose the .invoke() interface
    that routers/chat.py expects:

        executor.invoke({
            "input": str,
            "chat_history": list[BaseMessage],
            "session_id": str,
            "token": str,
        })
        → {"output": str}
    """

    def __init__(self, graph) -> None:
        self._graph = graph

    def invoke(self, inputs: dict) -> dict:
        user_input = inputs.get("input", "")
        chat_history: list = inputs.get("chat_history", [])
        session_id = inputs.get("session_id", "")
        token = inputs.get("token", "")

        system = SystemMessage(
            content=_SYSTEM_TEMPLATE.format(session_id=session_id, token=token)
        )
        messages = [system, *chat_history, HumanMessage(content=user_input)]

        try:
            result = self._graph.invoke({"messages": messages})
            last = result["messages"][-1]
            output = last.content if hasattr(last, "content") else str(last)
            return {"output": output}
        except Exception as exc:
            if _is_bedrock_error(exc):
                logger.warning("Bedrock unavailable (%s), falling back to rule-based agent", type(exc).__name__)
                return _rule_based_fallback(user_input, chat_history, session_id, token)
            raise


def _rule_based_fallback(user_input: str, chat_history: list, session_id: str, token: str) -> dict:
    """Standalone rule-based fallback — no Bedrock, no external session store needed."""
    import re

    required_fields = ["title", "location", "address", "date", "start_time", "end_time"]
    prompts = {
        "title":      "What should the campaign title be?",
        "location":   "Which neighbourhood or area will it be in?",
        "address":    "What's the full street address?",
        "date":       "What date is the event? (YYYY-MM-DD)",
        "start_time": "What time does it start? (HH:MM)",
        "end_time":   "What time does it end? (HH:MM)",
    }

    # Rebuild context from prior assistant turns that mention "saved X"
    context: dict = {}
    for msg in chat_history:
        text = (msg.content if hasattr(msg, "content") else "") or ""
        for field in required_fields:
            if field not in context and re.search(rf"\b{field}\b.*saved|saved.*\b{field}\b", text, re.I):
                context[field] = True  # approximate — just track presence

    # Extract obvious values from current message
    lowered = user_input.lower()
    if re.search(r"flyering|campaign|event", lowered) and "title" not in context:
        m = re.search(r'"([^"]+)"', user_input)
        if m:
            context["title"] = m.group(1)
    date_m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", user_input)
    if date_m:
        context["date"] = date_m.group(1)
    time_m = re.search(r"\b(\d{1,2}:\d{2})\b", user_input)
    if time_m:
        if "start_time" not in context:
            context["start_time"] = time_m.group(1)

    missing = [f for f in required_fields if f not in context]
    if missing:
        greeting = ""
        if not chat_history:
            greeting = "Hi! I'm your campaign creation assistant. Let's get your flyering event set up. "
        reply = greeting + prompts[missing[0]]
    else:
        reply = (
            "Great — I have all the required details. "
            "Note: the AI assistant is running in limited mode right now. "
            "Please use the Create Campaign form to finalise and publish your event."
        )

    return {"output": reply}


def build_agent_executor() -> _AgentExecutorCompat:
    """Build and return a Bedrock-backed agent executor."""
    model_id = os.getenv("BEDROCK_MODEL_ID") or "anthropic.claude-3-haiku-20240307-v1:0"
    region = os.getenv("AWS_DEFAULT_REGION") or os.getenv("AWS_REGION") or "us-east-1"

    llm = ChatBedrockConverse(
        model=model_id,
        region_name=region,
        temperature=0,
        max_tokens=1024,
    )

    graph = create_react_agent(llm, AGENT_TOOLS)
    return _AgentExecutorCompat(graph)


def format_history(messages: list[dict]) -> list:
    """Convert Supabase chat_messages rows to LangChain message objects.

    Excludes the last message (the current user turn, already passed as `input`).
    """
    history = []
    for msg in messages[:-1]:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if not content:
            continue
        if role == "user":
            history.append(HumanMessage(content=content))
        elif role == "assistant":
            history.append(AIMessage(content=content))
    return history
