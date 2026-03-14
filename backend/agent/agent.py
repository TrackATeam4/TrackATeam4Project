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
"""

import os
import re
import json
import httpx
from typing import TypedDict
from dotenv import load_dotenv

from langgraph.graph import StateGraph, START, END

from .system_prompt import SYSTEM_PROMPT
from .tools import TOOLS
from .tool_handlers import execute_tool

load_dotenv()

# ============================================================
# BEDROCK CONFIG
# ============================================================

BEDROCK_TOKEN = os.getenv("AWS_BEARER_TOKEN_BEDROCK")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
MODEL_ID = "amazon.nova-pro-v1:0"

BEDROCK_URL = (
    f"https://bedrock-runtime.{AWS_REGION}.amazonaws.com"
    f"/model/{MODEL_ID}/converse"
)

# Campaign tools — everything except web_search
CAMPAIGN_TOOL_NAMES = {
    "search_food_pantries",
    "create_campaign_event",
    "generate_personalized_flyer",
    "draft_invite_messages",
    "suggest_zone_assignments",
    "generate_impact_summary",
}


# ============================================================
# STATE DEFINITION
# ============================================================

class AgentState(TypedDict):
    """State that flows through all nodes in the graph."""
    messages: list[dict]              # Full conversation history
    tool_calls: list[dict]            # Accumulated tool call log
    final_response: str               # Agent's final text output
    user_id: str | None               # Authenticated user for DB operations
    _pending_tool_blocks: list[dict]  # Tools the model wants to call next


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
    return converse_messages


def parse_converse_response(response: dict) -> list[dict]:
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
                "input": tu["input"]
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
        "toolConfig": convert_tools_to_converse(tools),
        "inferenceConfig": {"maxTokens": 4096, "temperature": 0.7},
    }
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
    """
    Search DuckDuckGo using the ddgs package.
    """
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
    
    # Fallback: use DuckDuckGo lite HTML search
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://lite.duckduckgo.com/lite/",
            params={"q": query},
            headers={"User-Agent": "LemontreeVolunteerApp/1.0"}
        )
        if resp.status_code == 200:
            # Extract text snippets from the HTML (basic parsing)
            import re as regex
            snippets = regex.findall(r'<td class="result-snippet">(.*?)</td>', resp.text, regex.DOTALL)
            links = regex.findall(r'<a rel="nofollow" href="(https?://[^"]+)"', resp.text)
            results = []
            for i, snippet in enumerate(snippets[:5]):
                clean = regex.sub(r'<[^>]+>', '', snippet).strip()
                url = links[i] if i < len(links) else ""
                results.append({"text": clean, "url": url})
            if results:
                return {
                    "status": "success",
                    "abstract": results[0]["text"] if results else "",
                    "source": "DuckDuckGo Search",
                    "url": results[0]["url"] if results else "",
                    "related": results[1:],
                }

    return {
        "status": "error",
        "message": f"No results found for '{query}'",
    }


# ============================================================
# NODE 1: CALL MODEL
# Sends conversation to Bedrock, parses response.
# ============================================================

async def call_model_node(state: AgentState) -> dict:
    """
    NODE: call_model
    Calls the LLM with all tools available. The model decides
    which tools (if any) to call based on the conversation.
    """
    print(f"\n  [Node: call_model] Calling {MODEL_ID}...")

    response = await call_bedrock(state["messages"], SYSTEM_PROMPT, TOOLS)
    content_blocks = parse_converse_response(response)

    tool_blocks = [b for b in content_blocks if b.get("type") == "tool_use"]

    if not tool_blocks:
        # No tools requested — extract final text
        text = "".join(
            b.get("text", "") for b in content_blocks if b.get("type") == "text"
        )
        text = re.sub(r'<thinking>[\s\S]*?</thinking>\n?', '', text)
        print(f"  [Node: call_model] → Final response ({len(text)} chars)")
        return {"final_response": text, "_pending_tool_blocks": []}

    # Tools requested — store in state for routing
    updated_messages = state["messages"] + [{"role": "assistant", "content": content_blocks}]
    tool_names = [b["name"] for b in tool_blocks]
    print(f"  [Node: call_model] → Tools requested: {tool_names}")

    return {"messages": updated_messages, "_pending_tool_blocks": tool_blocks}


# ============================================================
# NODE 2: EXECUTE CAMPAIGN TOOLS
# Handles all Lemontree-specific tools.
# ============================================================

async def campaign_tools_node(state: AgentState) -> dict:
    """
    NODE: campaign_tools
    Executes Lemontree campaign tools: pantry search, event creation,
    flyer generation, invite drafting, zone assignments, impact summary.
    """
    tool_blocks = state.get("_pending_tool_blocks", [])
    user_id = state.get("user_id")
    tool_calls = list(state.get("tool_calls", []))
    tool_results = []

    # Only execute campaign tools (filter out web_search if mixed)
    for block in tool_blocks:
        if block["name"] not in CAMPAIGN_TOOL_NAMES:
            continue

        tool_name = block["name"]
        tool_input = block["input"]
        tool_id = block["id"]

        print(f"  [Node: campaign_tools] {tool_name}({json.dumps(tool_input, default=str)[:150]})")
        result = await execute_tool(tool_name, tool_input, user_id=user_id)
        print(f"  [Node: campaign_tools] {tool_name} → {result.get('status', 'unknown')}")

        tool_results.append({
            "type": "tool_result",
            "tool_use_id": tool_id,
            "content": json.dumps(result, default=str),
        })
        tool_calls.append({"tool": tool_name, "input": tool_input, "result": result})

    updated_messages = state["messages"] + [{"role": "user", "content": tool_results}]
    return {
        "messages": updated_messages,
        "tool_calls": tool_calls,
        "_pending_tool_blocks": [],
    }


# ============================================================
# NODE 3: WEB SEARCH
# Handles general/ambiguous questions via DuckDuckGo.
# ============================================================

async def web_search_node(state: AgentState) -> dict:
    """
    NODE: web_search
    Executes DuckDuckGo web search for general questions about
    food assistance, SNAP benefits, volunteer tips, or anything
    the campaign tools can't answer.
    """
    tool_blocks = state.get("_pending_tool_blocks", [])
    tool_calls = list(state.get("tool_calls", []))
    tool_results = []

    for block in tool_blocks:
        if block["name"] != "web_search":
            continue

        query = block["input"].get("query", "")
        tool_id = block["id"]

        print(f"  [Node: web_search] Searching DuckDuckGo: \"{query}\"")
        result = await duckduckgo_search(query)
        print(f"  [Node: web_search] → {result.get('status', 'unknown')}")

        tool_results.append({
            "type": "tool_result",
            "tool_use_id": tool_id,
            "content": json.dumps(result, default=str),
        })
        tool_calls.append({"tool": "web_search", "input": {"query": query}, "result": result})

    updated_messages = state["messages"] + [{"role": "user", "content": tool_results}]
    return {
        "messages": updated_messages,
        "tool_calls": tool_calls,
        "_pending_tool_blocks": [],
    }


# ============================================================
# ROUTER: Decides which node to go to after call_model
# ============================================================

def route_after_model(state: AgentState) -> str:
    """
    ROUTER: Inspects pending tool calls and routes to the correct node.
    
    - If any tool is web_search → route to web_search node
    - If any tool is a campaign tool → route to campaign_tools node
    - If no tools → route to END
    
    If BOTH types are requested in the same turn, web_search takes priority
    (campaign tools will be called in the next loop iteration).
    """
    pending = state.get("_pending_tool_blocks", [])

    if not pending:
        return END

    tool_names = {b["name"] for b in pending}

    # Check if web_search is among the requested tools
    if "web_search" in tool_names:
        print(f"  [Router] → web_search (query: general/ambiguous)")
        return "web_search"

    # Otherwise route to campaign tools
    print(f"  [Router] → campaign_tools ({tool_names})")
    return "campaign_tools"


# ============================================================
# BUILD THE GRAPH (3 nodes, conditional routing)
# ============================================================

def build_agent_graph() -> StateGraph:
    """
    Constructs the LangGraph StateGraph:

        START → call_model → {route_after_model}
                                ↓ campaign_tools    ↓ web_search      ↓ END
                          [campaign_tools]     [web_search]
                                ↓                    ↓
                          call_model ←───────────────┘  (both loop back)
    """
    graph = StateGraph(AgentState)

    # Add 3 nodes
    graph.add_node("call_model", call_model_node)
    graph.add_node("campaign_tools", campaign_tools_node)
    graph.add_node("web_search", web_search_node)

    # Entry point
    graph.add_edge(START, "call_model")

    # Conditional routing after model call
    graph.add_conditional_edges("call_model", route_after_model, {
        "campaign_tools": "campaign_tools",
        "web_search": "web_search",
        END: END,
    })

    # Both tool nodes loop back to call_model
    graph.add_edge("campaign_tools", "call_model")
    graph.add_edge("web_search", "call_model")

    return graph.compile()


# Compile once at module load
agent_graph = build_agent_graph()


# ============================================================
# PUBLIC API (called from main.py — same interface as before)
# ============================================================

async def run_agent(messages: list[dict], user_id: str | None = None) -> dict:
    """
    Run the Campaign Builder Agent using LangGraph.
    Same interface as before — main.py doesn't change.
    """
    if not BEDROCK_TOKEN:
        raise Exception(
            "AWS_BEARER_TOKEN_BEDROCK not set in .env file. "
            "Add your Bedrock bearer token to backend/.env"
        )

    initial_state: AgentState = {
        "messages": messages,
        "tool_calls": [],
        "final_response": "",
        "user_id": user_id,
        "_pending_tool_blocks": [],
    }

    final_state = await agent_graph.ainvoke(initial_state)

    return {
        "role": "assistant",
        "content": final_state.get("final_response", ""),
        "tool_calls": final_state.get("tool_calls", []),
    }