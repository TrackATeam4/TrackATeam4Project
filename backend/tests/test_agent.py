"""
Tests for agents/agent.py — LangGraph orchestrator.

Coverage:
  - Message / tool format converters
  - Response parser
  - Router logic (route_after_model)
  - call_model_node: final response, tool-call response
  - campaign_tools_node: success, unknown tool, execution error
  - web_search_node: success, search error
  - _resolve_tools_for_state: global vs request-scoped tools
  - run_agent: happy path, missing token guard
  - Full graph integration: no-tool turn, single-tool turn
"""

import asyncio
import json
import sys
from types import ModuleType
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_state(**overrides) -> dict:
    """Return a minimal valid AgentState dict."""
    base = {
        "messages": [],
        "tool_calls": [],
        "final_response": "",
        "session_id": None,
        "token": None,
        "_pending_tool_blocks": [],
    }
    base.update(overrides)
    return base


def _bedrock_text_response(text: str) -> dict:
    """Minimal Bedrock Converse API response with a single text block."""
    return {
        "output": {
            "message": {
                "content": [{"text": text}]
            }
        }
    }


def _bedrock_tool_response(tool_id: str, tool_name: str, tool_input: dict) -> dict:
    """Minimal Bedrock Converse API response requesting a tool call."""
    return {
        "output": {
            "message": {
                "content": [
                    {"toolUse": {"toolUseId": tool_id, "name": tool_name, "input": tool_input}}
                ]
            }
        }
    }


# ---------------------------------------------------------------------------
# Format converters
# ---------------------------------------------------------------------------

class TestConvertToolsToConverse:
    def test_single_tool_structure(self):
        from agents.agent import convert_tools_to_converse
        tools = [{
            "name": "save_event_field",
            "description": "Save a field.",
            "input_schema": {"type": "object", "properties": {"field": {"type": "string"}}},
        }]
        result = convert_tools_to_converse(tools)
        assert "tools" in result
        spec = result["tools"][0]["toolSpec"]
        assert spec["name"] == "save_event_field"
        assert spec["description"] == "Save a field."
        assert "json" in spec["inputSchema"]

    def test_multiple_tools_preserved(self):
        from agents.agent import convert_tools_to_converse
        tools = [
            {"name": "tool_a", "description": "A", "input_schema": {}},
            {"name": "tool_b", "description": "B", "input_schema": {}},
        ]
        result = convert_tools_to_converse(tools)
        names = [t["toolSpec"]["name"] for t in result["tools"]]
        assert names == ["tool_a", "tool_b"]


class TestConvertMessagesToConverse:
    def test_string_content(self):
        from agents.agent import convert_messages_to_converse
        msgs = [{"role": "user", "content": "Hello"}]
        result = convert_messages_to_converse(msgs)
        assert result[0]["role"] == "user"
        assert result[0]["content"] == [{"text": "Hello"}]

    def test_list_content_with_text_block(self):
        from agents.agent import convert_messages_to_converse
        msgs = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": [{"type": "text", "text": "Hi there"}]},
        ]
        result = convert_messages_to_converse(msgs)
        assert result[1]["content"] == [{"text": "Hi there"}]

    def test_list_content_with_tool_use_block(self):
        from agents.agent import convert_messages_to_converse
        msgs = [
            {"role": "user", "content": "Save title"},
            {
                "role": "assistant",
                "content": [{
                    "type": "tool_use",
                    "id": "tool-1",
                    "name": "save_event_field",
                    "input": {"field": "title", "value": "My Event"},
                }],
            },
        ]
        result = convert_messages_to_converse(msgs)
        block = result[1]["content"][0]
        assert "toolUse" in block
        assert block["toolUse"]["toolUseId"] == "tool-1"
        assert block["toolUse"]["name"] == "save_event_field"

    def test_list_content_with_tool_result_block(self):
        from agents.agent import convert_messages_to_converse
        msgs = [{
            "role": "user",
            "content": [{
                "type": "tool_result",
                "tool_use_id": "tool-1",
                "content": '{"status": "ok"}',
            }]
        }]
        result = convert_messages_to_converse(msgs)
        block = result[0]["content"][0]
        assert "toolResult" in block
        assert block["toolResult"]["toolUseId"] == "tool-1"

    def test_passthrough_already_converted_blocks(self):
        """Blocks already in Converse format (dict with 'text' key) pass through."""
        from agents.agent import convert_messages_to_converse
        msgs = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": [{"text": "already converted"}]},
        ]
        result = convert_messages_to_converse(msgs)
        assert result[1]["content"][0] == {"text": "already converted"}

    def test_non_list_non_string_content_cast(self):
        from agents.agent import convert_messages_to_converse
        msgs = [{"role": "user", "content": 12345}]
        result = convert_messages_to_converse(msgs)
        assert result[0]["content"] == [{"text": "12345"}]

    def test_consecutive_same_role_merged(self):
        """Consecutive messages with the same role must be merged (Bedrock alternating requirement)."""
        from agents.agent import convert_messages_to_converse
        msgs = [
            {"role": "user", "content": "prior session last message"},
            {"role": "user", "content": "current session first message"},
            {"role": "assistant", "content": "reply"},
        ]
        result = convert_messages_to_converse(msgs)
        # Two consecutive user messages become one merged message
        assert len(result) == 2
        assert result[0]["role"] == "user"
        assert len(result[0]["content"]) == 2  # both texts merged into one content list
        assert result[1]["role"] == "assistant"

    def test_leading_assistant_messages_stripped(self):
        """Messages before the first user message are dropped."""
        from agents.agent import convert_messages_to_converse
        msgs = [
            {"role": "assistant", "content": "orphaned assistant"},
            {"role": "user", "content": "first real message"},
        ]
        result = convert_messages_to_converse(msgs)
        assert len(result) == 1
        assert result[0]["role"] == "user"


class TestParseConverseResponse:
    def test_text_only_response(self):
        from agents.agent import parse_converse_response
        response = _bedrock_text_response("Here is my answer.")
        blocks = parse_converse_response(response)
        assert len(blocks) == 1
        assert blocks[0] == {"type": "text", "text": "Here is my answer."}

    def test_tool_use_response(self):
        from agents.agent import parse_converse_response
        response = _bedrock_tool_response("tu-1", "save_event_field", {"field": "title"})
        blocks = parse_converse_response(response)
        assert len(blocks) == 1
        assert blocks[0]["type"] == "tool_use"
        assert blocks[0]["id"] == "tu-1"
        assert blocks[0]["name"] == "save_event_field"
        assert blocks[0]["input"] == {"field": "title"}

    def test_mixed_text_and_tool(self):
        from agents.agent import parse_converse_response
        response = {
            "output": {
                "message": {
                    "content": [
                        {"text": "Let me save that."},
                        {"toolUse": {"toolUseId": "tu-2", "name": "check_conflicts", "input": {}}},
                    ]
                }
            }
        }
        blocks = parse_converse_response(response)
        assert len(blocks) == 2
        assert blocks[0]["type"] == "text"
        assert blocks[1]["type"] == "tool_use"

    def test_empty_response_returns_empty_list(self):
        from agents.agent import parse_converse_response
        blocks = parse_converse_response({})
        assert blocks == []


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

class TestRouteAfterModel:
    def test_no_pending_tools_routes_to_end(self):
        from agents.agent import route_after_model
        from langgraph.graph import END
        state = _make_state(_pending_tool_blocks=[])
        assert route_after_model(state) == END

    def test_campaign_tool_routes_to_campaign_tools(self):
        from agents.agent import route_after_model
        state = _make_state(_pending_tool_blocks=[
            {"name": "save_event_field", "id": "t1", "input": {}}
        ])
        assert route_after_model(state) == "campaign_tools"

    def test_web_search_routes_to_web_search(self):
        from agents.agent import route_after_model
        state = _make_state(_pending_tool_blocks=[
            {"name": "web_search", "id": "t2", "input": {"query": "food pantry"}}
        ])
        assert route_after_model(state) == "web_search"

    def test_web_search_takes_priority_over_campaign_tool(self):
        """If model requests both web_search and a campaign tool, web_search wins."""
        from agents.agent import route_after_model
        state = _make_state(_pending_tool_blocks=[
            {"name": "save_event_field", "id": "t1", "input": {}},
            {"name": "web_search",        "id": "t2", "input": {"query": "q"}},
        ])
        assert route_after_model(state) == "web_search"

    def test_multiple_campaign_tools_routes_to_campaign_tools(self):
        from agents.agent import route_after_model
        state = _make_state(_pending_tool_blocks=[
            {"name": "save_event_field", "id": "t1", "input": {}},
            {"name": "check_conflicts",  "id": "t2", "input": {}},
        ])
        assert route_after_model(state) == "campaign_tools"


# ---------------------------------------------------------------------------
# _resolve_tools_for_state
# ---------------------------------------------------------------------------

class TestResolveToolsForState:
    def test_no_session_returns_global_tools(self):
        from agents.agent import _resolve_tools_for_state, AGENT_TOOLS
        state = _make_state(session_id=None, token=None)
        registry, specs = _resolve_tools_for_state(state)
        assert set(registry.keys()) == {t.name for t in AGENT_TOOLS}

    def test_with_session_and_token_returns_request_scoped_tools(self):
        from agents.agent import _resolve_tools_for_state, AGENT_TOOLS
        state = _make_state(session_id="sess-123", token="jwt-abc")
        registry, specs = _resolve_tools_for_state(state)
        # Should still have the same tool names but as request-scoped wrappers
        assert set(registry.keys()) == {t.name for t in AGENT_TOOLS}

    def test_specs_contain_required_keys(self):
        from agents.agent import _resolve_tools_for_state
        state = _make_state()
        _, specs = _resolve_tools_for_state(state)
        for spec in specs:
            assert "name" in spec
            assert "description" in spec
            assert "input_schema" in spec


# ---------------------------------------------------------------------------
# call_model_node
# ---------------------------------------------------------------------------

class TestCallModelNode:
    @pytest.mark.asyncio
    async def test_final_text_response_no_tools(self):
        from agents.agent import call_model_node
        state = _make_state(messages=[{"role": "user", "content": "Hello"}])

        with patch("agents.agent.call_bedrock", new_callable=AsyncMock) as mock_bedrock:
            mock_bedrock.return_value = _bedrock_text_response("Hi! How can I help you?")
            result = await call_model_node(state)

        assert result["final_response"] == "Hi! How can I help you?"
        assert result["_pending_tool_blocks"] == []

    @pytest.mark.asyncio
    async def test_tool_call_response_populates_pending(self):
        from agents.agent import call_model_node
        state = _make_state(messages=[{"role": "user", "content": "Save my title"}])

        with patch("agents.agent.call_bedrock", new_callable=AsyncMock) as mock_bedrock:
            mock_bedrock.return_value = _bedrock_tool_response(
                "tu-1", "save_event_field", {"field": "title", "value": "Park Event"}
            )
            result = await call_model_node(state)

        assert len(result["_pending_tool_blocks"]) == 1
        assert result["_pending_tool_blocks"][0]["name"] == "save_event_field"
        # final_response is not returned by the node when tools are pending
        assert result.get("final_response", "") == ""

    @pytest.mark.asyncio
    async def test_thinking_tags_stripped_from_final_response(self):
        from agents.agent import call_model_node
        state = _make_state(messages=[{"role": "user", "content": "hello"}])

        raw = "<thinking>Let me figure this out.</thinking>\nSure, I can help!"
        with patch("agents.agent.call_bedrock", new_callable=AsyncMock) as mock_bedrock:
            mock_bedrock.return_value = _bedrock_text_response(raw)
            result = await call_model_node(state)

        assert "<thinking>" not in result["final_response"]
        assert "Sure, I can help!" in result["final_response"]

    @pytest.mark.asyncio
    async def test_tool_call_appends_assistant_message_to_history(self):
        from agents.agent import call_model_node
        initial_msgs = [{"role": "user", "content": "Hello"}]
        state = _make_state(messages=initial_msgs)

        with patch("agents.agent.call_bedrock", new_callable=AsyncMock) as mock_bedrock:
            mock_bedrock.return_value = _bedrock_tool_response("tu-1", "check_conflicts", {})
            result = await call_model_node(state)

        # A new assistant message with the tool_use block should be appended
        assert len(result["messages"]) == 2
        assert result["messages"][-1]["role"] == "assistant"


# ---------------------------------------------------------------------------
# campaign_tools_node
# ---------------------------------------------------------------------------

class TestCampaignToolsNode:
    @pytest.mark.asyncio
    async def test_executes_known_tool_and_appends_result(self):
        from agents.agent import campaign_tools_node

        mock_tool = MagicMock()
        mock_tool.invoke.return_value = {"status": "ok", "context": {"title": "Park Event"}}

        pending = [{"type": "tool_use", "id": "tu-1", "name": "save_event_field",
                    "input": {"field": "title", "value": "Park Event"}}]
        state = _make_state(
            messages=[{"role": "user", "content": "Save title"}],
            _pending_tool_blocks=pending,
        )

        with patch("agents.agent._resolve_tools_for_state",
                   return_value=({"save_event_field": mock_tool}, [])):
            result = await campaign_tools_node(state)

        mock_tool.invoke.assert_called_once_with({"field": "title", "value": "Park Event"})

        # Tool result message appended
        last_msg = result["messages"][-1]
        assert last_msg["role"] == "user"
        assert last_msg["content"][0]["type"] == "tool_result"
        assert last_msg["content"][0]["tool_use_id"] == "tu-1"

        # Tool call logged
        assert len(result["tool_calls"]) == 1
        assert result["tool_calls"][0]["tool"] == "save_event_field"

    @pytest.mark.asyncio
    async def test_unknown_tool_returns_error_result(self):
        from agents.agent import campaign_tools_node

        # Use a real campaign tool name so it passes the CAMPAIGN_TOOL_NAMES filter,
        # but provide an empty registry so it's "unknown" at lookup time.
        pending = [{"type": "tool_use", "id": "tu-2", "name": "save_event_field", "input": {}}]
        state = _make_state(
            messages=[],
            _pending_tool_blocks=pending,
        )

        with patch("agents.agent._resolve_tools_for_state", return_value=({}, [])):
            result = await campaign_tools_node(state)

        content_str = result["messages"][-1]["content"][0]["content"]
        assert "Error" in content_str or "error" in content_str.lower()
        assert "Unknown tool" in content_str

    @pytest.mark.asyncio
    async def test_tool_execution_exception_returns_error_result(self):
        from agents.agent import campaign_tools_node

        mock_tool = MagicMock()
        mock_tool.invoke.side_effect = Exception("Supabase timeout")

        pending = [{"type": "tool_use", "id": "tu-3", "name": "create_campaign", "input": {}}]
        state = _make_state(
            messages=[],
            _pending_tool_blocks=pending,
        )

        with patch("agents.agent._resolve_tools_for_state",
                   return_value=({"create_campaign": mock_tool}, [])):
            result = await campaign_tools_node(state)

        content_str = result["messages"][-1]["content"][0]["content"]
        assert "Error" in content_str or "error" in content_str.lower()
        assert "Supabase timeout" in content_str

    @pytest.mark.asyncio
    async def test_pending_cleared_after_execution(self):
        from agents.agent import campaign_tools_node

        mock_tool = MagicMock()
        mock_tool.invoke.return_value = {"status": "ok"}

        state = _make_state(
            messages=[],
            _pending_tool_blocks=[
                {"type": "tool_use", "id": "tu-4", "name": "check_conflicts", "input": {}}
            ],
        )

        with patch("agents.agent._resolve_tools_for_state",
                   return_value=({"check_conflicts": mock_tool}, [])):
            result = await campaign_tools_node(state)

        assert result["_pending_tool_blocks"] == []

    @pytest.mark.asyncio
    async def test_web_search_tool_skipped_in_campaign_node(self):
        """campaign_tools_node should not execute web_search blocks."""
        from agents.agent import campaign_tools_node

        pending = [{"type": "tool_use", "id": "tu-5", "name": "web_search",
                    "input": {"query": "food pantry near me"}}]
        state = _make_state(messages=[], _pending_tool_blocks=pending)

        with patch("agents.agent._resolve_tools_for_state", return_value=({}, [])):
            result = await campaign_tools_node(state)

        # No tool results appended — web_search was filtered out
        last_msg = result["messages"][-1]
        assert last_msg["content"] == []


# ---------------------------------------------------------------------------
# web_search_node
# ---------------------------------------------------------------------------

class TestWebSearchNode:
    @pytest.mark.asyncio
    async def test_successful_search_appends_result(self):
        from agents.agent import web_search_node

        search_result = {
            "status": "success",
            "results": [{"title": "SNAP Benefits", "snippet": "Apply online.", "url": "https://snap.gov"}],
        }
        pending = [{"type": "tool_use", "id": "ws-1", "name": "web_search",
                    "input": {"query": "how to apply for SNAP"}}]
        state = _make_state(messages=[], _pending_tool_blocks=pending)

        with patch("agents.agent.duckduckgo_search", new_callable=AsyncMock,
                   return_value=search_result):
            result = await web_search_node(state)

        last_msg = result["messages"][-1]
        assert last_msg["role"] == "user"
        content_str = last_msg["content"][0]["content"]
        # _format_search_result returns a human-readable string, not JSON
        assert "SNAP Benefits" in content_str or "snap.gov" in content_str

    @pytest.mark.asyncio
    async def test_search_error_still_appends_result(self):
        from agents.agent import web_search_node

        pending = [{"type": "tool_use", "id": "ws-2", "name": "web_search",
                    "input": {"query": "anything"}}]
        state = _make_state(messages=[], _pending_tool_blocks=pending)

        with patch("agents.agent.duckduckgo_search", new_callable=AsyncMock,
                   return_value={"status": "error", "message": "Network timeout"}):
            result = await web_search_node(state)

        content_str = result["messages"][-1]["content"][0]["content"]
        assert "Network timeout" in content_str or "failed" in content_str.lower()

    @pytest.mark.asyncio
    async def test_non_web_search_blocks_skipped(self):
        """web_search_node must not execute campaign tool blocks."""
        from agents.agent import web_search_node

        pending = [{"type": "tool_use", "id": "t1", "name": "save_event_field", "input": {}}]
        state = _make_state(messages=[], _pending_tool_blocks=pending)

        with patch("agents.agent.duckduckgo_search", new_callable=AsyncMock) as mock_search:
            result = await web_search_node(state)

        mock_search.assert_not_called()
        # No tool results appended
        assert result["messages"][-1]["content"] == []

    @pytest.mark.asyncio
    async def test_pending_cleared_after_search(self):
        from agents.agent import web_search_node

        pending = [{"type": "tool_use", "id": "ws-3", "name": "web_search",
                    "input": {"query": "test"}}]
        state = _make_state(messages=[], _pending_tool_blocks=pending)

        with patch("agents.agent.duckduckgo_search", new_callable=AsyncMock,
                   return_value={"status": "success", "results": []}):
            result = await web_search_node(state)

        assert result["_pending_tool_blocks"] == []


# ---------------------------------------------------------------------------
# duckduckgo_search
# ---------------------------------------------------------------------------

def _fake_ddgs_module(mock_ddgs_cls: MagicMock) -> ModuleType:
    """Build a minimal fake 'ddgs' module that exports a mock DDGS class."""
    mod = ModuleType("ddgs")
    mod.DDGS = mock_ddgs_cls  # type: ignore[attr-defined]
    return mod


class TestDuckduckgoSearch:
    @pytest.mark.asyncio
    async def test_returns_success_with_results(self):
        from agents.agent import duckduckgo_search

        fake_results = [
            {"title": "Food Bank NYC", "body": "Free meals available.", "href": "https://foodbanknyc.org"},
        ]
        mock_ddgs_cls = MagicMock()
        mock_ddgs = MagicMock()
        mock_ddgs.text.return_value = iter(fake_results)
        mock_ddgs_cls.return_value.__enter__.return_value = mock_ddgs

        with patch.dict(sys.modules, {"ddgs": _fake_ddgs_module(mock_ddgs_cls)}):
            result = await duckduckgo_search("food bank NYC")

        assert result["status"] == "success"
        assert len(result["results"]) == 1
        assert result["results"][0]["title"] == "Food Bank NYC"

    @pytest.mark.asyncio
    async def test_returns_error_on_empty_results(self):
        from agents.agent import duckduckgo_search

        mock_ddgs_cls = MagicMock()
        mock_ddgs = MagicMock()
        mock_ddgs.text.return_value = iter([])
        mock_ddgs_cls.return_value.__enter__.return_value = mock_ddgs

        with patch.dict(sys.modules, {"ddgs": _fake_ddgs_module(mock_ddgs_cls)}):
            result = await duckduckgo_search("xyzzy nothing found")

        assert result["status"] == "error"

    @pytest.mark.asyncio
    async def test_returns_error_on_exception(self):
        from agents.agent import duckduckgo_search

        mock_ddgs_cls = MagicMock(side_effect=Exception("Network error"))

        with patch.dict(sys.modules, {"ddgs": _fake_ddgs_module(mock_ddgs_cls)}):
            result = await duckduckgo_search("anything")

        assert result["status"] == "error"
        assert "Network error" in result["message"]


# ---------------------------------------------------------------------------
# run_agent
# ---------------------------------------------------------------------------

class TestRunAgent:
    @pytest.mark.asyncio
    async def test_raises_when_bedrock_token_missing(self, monkeypatch):
        monkeypatch.setattr("agents.agent.BEDROCK_TOKEN", None)
        from agents.agent import run_agent

        with pytest.raises(Exception, match="AWS_BEARER_TOKEN_BEDROCK"):
            await run_agent([{"role": "user", "content": "hello"}])

    @pytest.mark.asyncio
    async def test_returns_final_response_no_tools(self, monkeypatch):
        monkeypatch.setattr("agents.agent.BEDROCK_TOKEN", "fake-token")
        from agents.agent import run_agent

        with patch("agents.agent.call_bedrock", new_callable=AsyncMock) as mock_bedrock:
            mock_bedrock.return_value = _bedrock_text_response("Welcome to Lemontree!")
            result = await run_agent([{"role": "user", "content": "hello"}])

        assert result["role"] == "assistant"
        assert result["content"] == "Welcome to Lemontree!"
        assert result["tool_calls"] == []

    @pytest.mark.asyncio
    async def test_passes_session_id_and_token_to_state(self, monkeypatch):
        monkeypatch.setattr("agents.agent.BEDROCK_TOKEN", "fake-token")
        from agents.agent import run_agent

        captured_state: dict[str, Any] = {}

        async def fake_ainvoke(state, config=None):
            captured_state.update(state)
            return {**state, "final_response": "done", "tool_calls": []}

        with patch("agents.agent.agent_graph") as mock_graph:
            mock_graph.ainvoke = fake_ainvoke
            await run_agent(
                [{"role": "user", "content": "hello"}],
                session_id="sess-abc",
                token="jwt-xyz",
            )

        assert captured_state["session_id"] == "sess-abc"
        assert captured_state["token"] == "jwt-xyz"

    @pytest.mark.asyncio
    async def test_single_tool_turn_then_final_response(self, monkeypatch):
        """Graph: call_model → campaign_tools → call_model → END"""
        monkeypatch.setattr("agents.agent.BEDROCK_TOKEN", "fake-token")
        from agents.agent import run_agent

        call_count = {"n": 0}

        async def fake_bedrock(messages, system, tools):
            call_count["n"] += 1
            if call_count["n"] == 1:
                # First call: request a tool
                return _bedrock_tool_response("tu-1", "save_event_field",
                                              {"field": "title", "value": "Test Event"})
            # Second call: final text answer
            return _bedrock_text_response("Campaign info saved!")

        mock_tool = MagicMock()
        mock_tool.invoke.return_value = {"status": "ok"}

        with patch("agents.agent.call_bedrock", new_callable=AsyncMock, side_effect=fake_bedrock), \
             patch("agents.agent._resolve_tools_for_state",
                   return_value=({"save_event_field": mock_tool}, [])):
            result = await run_agent([{"role": "user", "content": "Save my title"}])

        assert result["content"] == "Campaign info saved!"
        assert len(result["tool_calls"]) == 1
        assert result["tool_calls"][0]["tool"] == "save_event_field"
        assert call_count["n"] == 2


# ---------------------------------------------------------------------------
# build_agent_graph
# ---------------------------------------------------------------------------

class TestBuildAgentGraph:
    def test_graph_compiles_without_error(self):
        from agents.agent import build_agent_graph
        graph = build_agent_graph()
        assert graph is not None

    def test_graph_has_expected_nodes(self):
        from agents.agent import build_agent_graph
        graph = build_agent_graph()
        # LangGraph compiled graphs expose get_graph()
        nodes = graph.get_graph().nodes
        assert "call_model" in nodes
        assert "campaign_tools" in nodes
        assert "web_search" in nodes
