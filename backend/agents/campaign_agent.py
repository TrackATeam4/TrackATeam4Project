"""LangGraph-backed campaign agent with an AgentExecutor-compatible interface.

Exposes:
    build_agent_executor() -> _AgentExecutorCompat
    format_history(messages) -> list[BaseMessage]

Called lazily by routers/chat.py so the Bedrock client is only
instantiated when the first message arrives (not on server startup).
"""

from __future__ import annotations

import os

from langchain_aws import ChatBedrockConverse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from agents.tools import AGENT_TOOLS

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

        result = self._graph.invoke({"messages": messages})
        last = result["messages"][-1]
        output = last.content if hasattr(last, "content") else str(last)
        return {"output": output}


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
