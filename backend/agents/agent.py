# Credit to Viral0401 for this part of the codebase!

"""
Core agent logic — LangGraph orchestrator with 3 nodes for the Lemontree Campaign Builder.

Graph Architecture (3 nodes, conditional routing):

    [START] → [call_model] → {route_tools?}
                                 ↓ campaign_tools    ↓ web_search       ↓ no tools
                          [campaign_tools]      [web_search]           [END]
                                 ↓                    ↓
                          [call_model] ←──────────────┘  (both loop back)

Node 1: call_model      — Calls Bedrock LLM, decides which tools to use
Node 2: campaign_tools   — Executes Lemontree-specific tools (pantry search, event creation, flyers, etc.)
Node 3: web_search       — Handles general questions via DuckDuckGo web search

The router after call_model inspects which tools were requested:
  - If web_search tool → route to web_search node
  - If any campaign tool → route to campaign_tools node
  - If no tools → route to END

Set this in your .env:
    AWS_BEARER_TOKEN_BEDROCK=your-token-here
    AWS_REGION=us-east-1
    BEDROCK_MODEL_ID=us.amazon.nova-pro-v1:0
"""

import os
import re
import json
import httpx
from typing import Any, TypedDict
from dotenv import load_dotenv

from langgraph.graph import StateGraph, START, END

from .chat_service import CAMPAIGN_AGENT_SYSTEM_PROMPT
from .tools import AGENT_TOOLS, build_request_tools

load_dotenv()

# ============================================================
# BEDROCK CONFIG
# ============================================================

BEDROCK_TOKEN = os.getenv("AWS_BEARER_TOKEN_BEDROCK")
AWS_REGION = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0").strip().strip('"')

BEDROCK_URL = (
    f"https://bedrock-runtime.{AWS_REGION}.amazonaws.com"
    f"/model/{MODEL_ID}/converse"
)

# Campaign tools — everything except web_search
CAMPAIGN_TOOL_NAMES = {tool.name for tool in AGENT_TOOLS}

# Maximum tool-call iterations per user message to prevent infinite loops
MAX_TOOL_ITERATIONS = 3


# ============================================================
# STATE DEFINITION
# ============================================================

class AgentState(TypedDict):
    """State that flows through all nodes in the graph."""
    messages: list[dict]              # Full conversation history
    tool_calls: list[dict]            # Accumulated tool call log
    final_response: str               # Agent's final text output
    session_id: str | None            # Session context for request-scoped tools
    token: str | None                 # Auth token for request-scoped tools
    _pending_tool_blocks: list[dict]  # Tools the model wants to call next
    _tool_iteration: int              # Loop counter — resets each user message


def _tool_input_schema(tool_obj: Any) -> dict:
    args_schema = getattr(tool_obj, "args_schema", None)
    if args_schema is not None and hasattr(args_schema, "model_json_schema"):
        return args_schema.model_json_schema()
    return {
        "type": "object",
        "properties": getattr(tool_obj, "args", {}),
    }


def _tool_to_spec(tool_obj: Any) -> dict:
    return {
        "name": tool_obj.name,
        "description": tool_obj.description or f"Tool: {tool_obj.name}",
        "input_schema": _tool_input_schema(tool_obj),
    }


TOOL_REGISTRY = {tool.name: tool for tool in AGENT_TOOLS}
BEDROCK_TOOL_SPECS = [_tool_to_spec(tool) for tool in AGENT_TOOLS]


def _resolve_tools_for_state(state: AgentState) -> tuple[dict[str, Any], list[dict]]:
    """Return tool registry/specs, using request-scoped wrappers when session context is available."""
    session_id = state.get("session_id")
    token = state.get("token")

    if session_id and token:
        tools = build_request_tools(session_id=session_id, token=token)
    else:
        tools = AGENT_TOOLS

    registry = {tool.name: tool for tool in tools}
    specs = [_tool_to_spec(tool) for tool in tools]
    return registry, specs


def _format_tool_result(tool_name: str, result: Any) -> str:
    """Convert a raw tool result dict into a readable summary for the model.

    Treat a result as an error ONLY when there is an explicit error signal.
    All other responses (200 context saves, 201 campaign creates, etc.) are success.
    """
    if not isinstance(result, dict):
        return str(result)

    # Explicit error signals from _safe_response or direct tool errors
    is_error = (
        result.get("status") == "error"
        or result.get("success") is False
        or (result.get("detail") is not None and not result.get("context") and not result.get("campaign_id"))
    )

    if is_error:
        error_msg = (
            result.get("message")
            or result.get("detail")
            or result.get("error")
            or json.dumps(result, default=str)
        )
        return f"Error: {error_msg}"

    # — Success path — surface the most useful fields for the model
    parts = []

    # save_event_field: {"context": {field: value, ...}}
    ctx = result.get("context")
    if ctx and isinstance(ctx, dict):
        saved = {k: v for k, v in ctx.items() if v}
        if saved:
            parts.append(f"saved fields: {json.dumps(saved, default=str)}")

    # All other tools — surface known important keys
    for key in ("campaign_id", "summary", "message", "flyer_url", "thumbnail_url",
                "google_calendar_url", "invite_url", "content", "title", "date"):
        val = (
            result.get("data", {}).get(key)
            if isinstance(result.get("data"), dict)
            else result.get(key)
        )
        if val:
            parts.append(f"{key}: {val}")

    return "Success. " + "; ".join(parts) if parts else "Success."


# ============================================================
# FORMAT CONVERTERS (Bedrock Converse API)
# ============================================================

def convert_tools_to_converse(tools: list[dict]) -> dict:
    converse_tools = []
    for tool in tools:
        converse_tools.append({
            "toolSpec": {
                "name": tool["name"],
                "description": tool["description"],
                "inputSchema": {"json": tool["input_schema"]}
            }
        })
    return {"tools": converse_tools}


def convert_messages_to_converse(messages: list[dict]) -> list[dict]:
    # Bedrock requires conversations to start with a user message.
    # Drop any leading assistant messages (can appear from cross-session history).
    first_user = next((i for i, m in enumerate(messages) if m.get("role") == "user"), None)
    if first_user is None:
        return []
    messages = messages[first_user:]

    converse_messages = []
    for msg in messages:
        role = msg["role"]
        content = msg["content"]

        if isinstance(content, str):
            converse_messages.append({"role": role, "content": [{"text": content}]})
            continue

        if isinstance(content, list):
            converted = []
            for block in content:
                if block.get("type") == "text":
                    converted.append({"text": block["text"]})
                elif block.get("type") == "tool_use":
                    converted.append({
                        "toolUse": {
                            "toolUseId": block["id"],
                            "name": block["name"],
                            "input": block["input"]
                        }
                    })
                elif block.get("type") == "tool_result":
                    converted.append({
                        "toolResult": {
                            "toolUseId": block["tool_use_id"],
                            "content": [{"text": block["content"]}]
                        }
                    })
                elif "toolUse" in block or "toolResult" in block or "text" in block:
                    converted.append(block)
            if converted:
                converse_messages.append({"role": role, "content": converted})
            continue

        converse_messages.append({"role": role, "content": [{"text": str(content)}]})

    # Bedrock requires strictly alternating user/assistant roles.
    # Merge consecutive same-role messages — this can happen when cross-session history
    # is prepended and creates a user→user or assistant→assistant boundary.
    merged: list[dict] = []
    for msg in converse_messages:
        if merged and merged[-1]["role"] == msg["role"]:
            merged[-1] = {
                "role": msg["role"],
                "content": merged[-1]["content"] + msg["content"],
            }
        else:
            merged.append(msg)

    return merged


def parse_converse_response(response: dict) -> list[dict]:
    """Parse a Bedrock Converse API response into a flat list of content blocks."""
    output = response.get("output", {})
    message = output.get("message", {})
    converse_content = message.get("content", [])

    blocks = []
    for block in converse_content:
        if "text" in block:
            blocks.append({"type": "text", "text": block["text"]})
        elif "toolUse" in block:
            tu = block["toolUse"]
            blocks.append({
                "type": "tool_use",
                "id": tu["toolUseId"],
                "name": tu["name"],
                "input": tu["input"],
            })
    return blocks


# ============================================================
# BEDROCK API CALL
# ============================================================

async def call_bedrock(messages: list[dict], system: str, tools: list[dict]) -> dict:
    body = {
        "modelId": MODEL_ID,
        "messages": convert_messages_to_converse(messages),
        "system": [{"text": system}],
        "inferenceConfig": {"maxTokens": 4096, "temperature": 0.3},
    }
    # Bedrock rejects toolConfig with an empty tools list — only include when tools exist
    if tools:
        body["toolConfig"] = convert_tools_to_converse(tools)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {BEDROCK_TOKEN}",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(BEDROCK_URL, json=body, headers=headers)
        if resp.status_code != 200:
            raise Exception(f"Bedrock API error ({resp.status_code}): {resp.text}")
        return resp.json()


# ============================================================
# DUCKDUCKGO WEB SEARCH
# ============================================================

async def duckduckgo_search(query: str) -> dict:
    """Search DuckDuckGo using the ddgs package."""
    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))

        if results:
            return {
                "status": "success",
                "results": [
                    {
                        "title": r.get("title", ""),
                        "snippet": r.get("body", ""),
                        "url": r.get("href", ""),
                    }
                    for r in results
                ],
            }

        return {"status": "error", "message": f"No results found for '{query}'"}

    except Exception as e:
        return {"status": "error", "message": f"Search failed: {str(e)}"}


def _format_search_result(result: dict) -> str:
    """Format a DuckDuckGo search result into a readable string for the model."""
    if result.get("status") != "success":
        return f"Search failed: {result.get('message', 'unknown error')}"
    items = result.get("results", [])
    if not items:
        return "No results found."
    lines = []
    for item in items[:3]:
        title = item.get("title", "")
        snippet = item.get("snippet", "")
        url = item.get("url", "")
        lines.append(f"- {title}: {snippet} ({url})")
    return "Search results:\n" + "\n".join(lines)


# ============================================================
# NODE 1: CALL MODEL
# ============================================================

async def call_model_node(state: AgentState) -> dict:
    """
    NODE: call_model
    Calls the LLM with all tools available. The model decides
    which tools (if any) to call based on the conversation.
    """
    iteration = state.get("_tool_iteration", 0)

    # Safety: bail out if we've looped too many times in one user turn
    if iteration >= MAX_TOOL_ITERATIONS:
        print(f"  [Node: call_model] ⚠ Loop limit reached ({iteration} iterations), stopping.")
        return {
            "final_response": "I've completed several steps in this turn. Let me know what you'd like to do next.",
            "_pending_tool_blocks": [],
        }

    print(f"  [Node: call_model] Calling {MODEL_ID} (iteration {iteration})...")

    _, tool_specs = _resolve_tools_for_state(state)
    response = await call_bedrock(state["messages"], CAMPAIGN_AGENT_SYSTEM_PROMPT, tool_specs)
    content_blocks = parse_converse_response(response)

    tool_blocks = [b for b in content_blocks if b.get("type") == "tool_use"]

    if not tool_blocks:
        text = "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text")
        # Strip thinking tags emitted by some models
        text = re.sub(r'<thinking>[\s\S]*?</thinking>\n?', '', text).strip()
        print(f"  [Node: call_model] → Final response ({len(text)} chars)")
        return {"final_response": text, "_pending_tool_blocks": []}

    updated_messages = state["messages"] + [{"role": "assistant", "content": content_blocks}]
    tool_names = [b["name"] for b in tool_blocks]
    print(f"  [Node: call_model] → Tools requested: {tool_names}")

    return {
        "messages": updated_messages,
        "_pending_tool_blocks": tool_blocks,
        "_tool_iteration": iteration + 1,
    }


# ============================================================
# NODE 2: EXECUTE CAMPAIGN TOOLS
# ============================================================

async def campaign_tools_node(state: AgentState) -> dict:
    """
    NODE: campaign_tools
    Executes Lemontree campaign tools and returns readable results.

    Auto-chain: when create_campaign succeeds, immediately executes generate_flyer
    and post_campaign_to_bluesky in the same node pass and injects their results as
    synthetic tool-use/result pairs. This prevents Nova Pro from hallucinating those
    results instead of calling the tools.
    """
    tool_blocks = state.get("_pending_tool_blocks", [])
    tool_calls = list(state.get("tool_calls", []))
    tool_results = []
    should_auto_chain = False

    tool_registry, _ = _resolve_tools_for_state(state)

    for block in tool_blocks:
        if block["name"] not in CAMPAIGN_TOOL_NAMES:
            continue

        tool_name = block["name"]
        tool_input = block["input"]
        tool_id = block["id"]

        print(f"  [Node: campaign_tools] {tool_name}({json.dumps(tool_input, default=str)[:150]})")

        tool_fn = tool_registry.get(tool_name)
        if tool_fn is None:
            result = {"status": "error", "message": f"Unknown tool: {tool_name}"}
        else:
            try:
                result = tool_fn.invoke(tool_input)
            except Exception as exc:
                result = {"status": "error", "message": str(exc)}

        readable = _format_tool_result(tool_name, result)
        print(f"  [Node: campaign_tools] {tool_name} → {readable[:80]}")

        tool_results.append({
            "type": "tool_result",
            "tool_use_id": tool_id,
            "content": readable,
        })
        tool_calls.append({"tool": tool_name, "input": tool_input, "result": result})

        if tool_name == "create_campaign" and not readable.startswith("Error:"):
            should_auto_chain = True

    updated_messages = state["messages"] + [{"role": "user", "content": tool_results}]

    # Auto-chain generate_flyer + post_campaign_to_bluesky after successful create_campaign.
    # Only runs in real request context (session_id + token present) so tests are unaffected.
    if should_auto_chain and state.get("session_id") and state.get("token"):
        for auto_name in ("generate_flyer", "post_campaign_to_bluesky"):
            auto_fn = tool_registry.get(auto_name)
            if auto_fn is None:
                continue
            auto_id = f"auto_{auto_name}_{os.urandom(4).hex()}"
            print(f"  [Node: campaign_tools] AUTO-CHAIN {auto_name}")
            try:
                auto_result = auto_fn.invoke({})
            except Exception as exc:
                auto_result = {"status": "error", "message": str(exc)}
            auto_readable = _format_tool_result(auto_name, auto_result)
            print(f"  [Node: campaign_tools] AUTO {auto_name} → {auto_readable[:80]}")
            # Inject synthetic toolUse from "assistant" + toolResult from "user"
            # so the conversation history remains well-formed for Bedrock.
            updated_messages.append({
                "role": "assistant",
                "content": [{"type": "tool_use", "id": auto_id, "name": auto_name, "input": {}}],
            })
            updated_messages.append({
                "role": "user",
                "content": [{"type": "tool_result", "tool_use_id": auto_id, "content": auto_readable}],
            })
            tool_calls.append({"tool": auto_name, "input": {}, "result": auto_result})

    return {
        "messages": updated_messages,
        "tool_calls": tool_calls,
        "_pending_tool_blocks": [],
    }


# ============================================================
# NODE 3: WEB SEARCH
# ============================================================

async def web_search_node(state: AgentState) -> dict:
    """
    NODE: web_search
    Executes DuckDuckGo web search for general questions.
    """
    tool_blocks = state.get("_pending_tool_blocks", [])
    tool_calls = list(state.get("tool_calls", []))
    tool_results = []

    for block in tool_blocks:
        if block["name"] != "web_search":
            continue

        query = block["input"].get("query", "")
        tool_id = block["id"]

        print(f"  [Node: web_search] Searching: \"{query}\"")
        result = await duckduckgo_search(query)
        readable = _format_search_result(result)
        print(f"  [Node: web_search] → {result.get('status', 'unknown')}")

        tool_results.append({
            "type": "tool_result",
            "tool_use_id": tool_id,
            "content": readable,
        })
        tool_calls.append({"tool": "web_search", "input": {"query": query}, "result": result})

    updated_messages = state["messages"] + [{"role": "user", "content": tool_results}]
    return {
        "messages": updated_messages,
        "tool_calls": tool_calls,
        "_pending_tool_blocks": [],
    }


# ============================================================
# ROUTER
# ============================================================

def route_after_model(state: AgentState) -> str:
    pending = state.get("_pending_tool_blocks", [])
    if not pending:
        return END

    tool_names = {b["name"] for b in pending}

    if "web_search" in tool_names:
        print(f"  [Router] → web_search")
        return "web_search"

    if tool_names & CAMPAIGN_TOOL_NAMES:
        print(f"  [Router] → campaign_tools ({tool_names})")
        return "campaign_tools"

    return END


# ============================================================
# BUILD THE GRAPH
# ============================================================

def build_agent_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    graph.add_node("call_model", call_model_node)
    graph.add_node("campaign_tools", campaign_tools_node)
    graph.add_node("web_search", web_search_node)

    graph.add_edge(START, "call_model")
    graph.add_conditional_edges("call_model", route_after_model, {
        "campaign_tools": "campaign_tools",
        "web_search": "web_search",
        END: END,
    })
    graph.add_edge("campaign_tools", "call_model")
    graph.add_edge("web_search", "call_model")

    return graph.compile(checkpointer=None, debug=False)


# Compile once at module load
agent_graph = build_agent_graph()


# ============================================================
# PUBLIC API
# ============================================================

async def run_agent(
    messages: list[dict],
    session_id: str | None = None,
    token: str | None = None,
) -> dict:
    """Run the Campaign Builder Agent using LangGraph."""
    if not BEDROCK_TOKEN:
        raise Exception(
            "AWS_BEARER_TOKEN_BEDROCK not set in .env file. "
            "Add your Bedrock bearer token to backend/.env"
        )

    initial_state: AgentState = {
        "messages": messages,
        "tool_calls": [],
        "final_response": "",
        "session_id": session_id,
        "token": token,
        "_pending_tool_blocks": [],
        "_tool_iteration": 0,
    }

    final_state = await agent_graph.ainvoke(initial_state, {"recursion_limit": 20})

    return {
        "role": "assistant",
        "content": final_state.get("final_response", ""),
        "tool_calls": final_state.get("tool_calls", []),
    }
