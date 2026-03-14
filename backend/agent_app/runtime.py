from __future__ import annotations

import os
from typing import Any, Optional, Sequence, cast

from langchain_aws import ChatBedrockConverse
from langgraph.prebuilt import create_react_agent

from .tools import resolve_tools


def build_model(
    model: Optional[str] = None,
    region_name: Optional[str] = None,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
) -> ChatBedrockConverse:
    """Build a Bedrock chat model using explicit args or env defaults."""
    model_id = model or os.getenv("BEDROCK_MODEL_ID", "mistral.mistral-large-2402-v1:0")
    region = region_name or os.getenv("AWS_REGION", "us-east-1")

    return ChatBedrockConverse(
        model=model_id,
        region_name=region,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def build_agent(
    tool_names: Optional[Sequence[str]] = None,
    model: Optional[str] = None,
    region_name: Optional[str] = None,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
):
    """Create a ReAct agent with a configurable model and selected tools."""
    llm = build_model(
        model=model,
        region_name=region_name,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    tools = resolve_tools(tool_names)
    return create_react_agent(llm, tools)


def run_prompt(
    prompt: str,
    tool_names: Optional[Sequence[str]] = None,
    stream: bool = True,
    model: Optional[str] = None,
    region_name: Optional[str] = None,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
) -> None:
    """Execute one prompt against the configured agent."""
    agent = build_agent(
        tool_names=tool_names,
        model=model,
        region_name=region_name,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    # LangGraph accepts a mapping-like state input; cast keeps static checkers quiet.
    inputs = cast(Any, {"messages": [("user", prompt)]})

    if stream:
        for chunk in agent.stream(inputs, stream_mode="values"):
            message = chunk["messages"][-1]
            message.pretty_print()
        return

    result = agent.invoke(inputs)
    result["messages"][-1].pretty_print()

