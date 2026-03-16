"""Tests for chat router endpoints."""

from unittest.mock import MagicMock, call

import pytest


SESSION_ID = "660e8400-e29b-41d4-a716-446655440002"
USER_ID = "user-uuid-123"
OTHER_USER_ID = "user-uuid-999"
CAMPAIGN_ID = "770e8400-e29b-41d4-a716-446655440003"

MOCK_SESSION = {
    "id": SESSION_ID,
    "user_id": USER_ID,
    "context": {},
    "status": "active",
    "created_at": "2026-03-14T10:00:00+00:00",
    "updated_at": "2026-03-14T10:00:00+00:00",
}

MOCK_MESSAGES = [
    {"id": "m1", "session_id": SESSION_ID, "role": "user", "content": "Hi", "created_at": "2026-03-14T10:01:00+00:00"},
    {"id": "m2", "session_id": SESSION_ID, "role": "assistant", "content": "Hello!", "created_at": "2026-03-14T10:01:01+00:00"},
]


def _make_table_router(tables: dict):
    """Build a table side_effect function from a mapping of table_name -> mock_table."""
    def table_router(table_name):
        if table_name in tables:
            return tables[table_name]
        return MagicMock()
    return table_router


def _mock_table_result(data):
    """Create a mock with .execute().data returning the given data."""
    result = MagicMock()
    result.data = data
    return result


def _set_session_lookup(session_tbl, session_data):
    """Mock chat_sessions select-by-id lookup using limit(1)."""
    session_tbl.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
        _mock_table_result(session_data)
    )


@pytest.fixture(autouse=True)
def mock_agent(monkeypatch):
    """Prevent real AWS calls during tests."""
    mock_executor = MagicMock()
    mock_executor.invoke.return_value = {"output": "Hello! What would you like to organize?"}
    monkeypatch.setattr("routers.chat._get_agent_executor", lambda: mock_executor)

    from langchain_core.messages import HumanMessage, AIMessage

    def _fake_format_history(messages):
        result = []
        for m in messages:
            if m["role"] == "user":
                result.append(HumanMessage(content=m["content"]))
            else:
                result.append(AIMessage(content=m["content"]))
        return result

    monkeypatch.setattr("routers.chat._get_format_history", lambda: _fake_format_history)
    return mock_executor


# ---------------------------------------------------------------------------
# POST /chat/session
# ---------------------------------------------------------------------------

class TestCreateSession:
    """POST /chat/session"""

    def test_create_session_success(self, client, mock_supabase):
        insert_result = _mock_table_result([{**MOCK_SESSION}])
        tbl = MagicMock()
        tbl.insert.return_value.execute.return_value = insert_result
        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": tbl})

        resp = client.post("/chat/session")
        assert resp.status_code == 201
        body = resp.json()
        assert "session_id" in body
        assert body["context"] == {}

    def test_create_session_unauthorized(self, unauth_client):
        resp = unauth_client.post("/chat/session")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /chat/session/{id}
# ---------------------------------------------------------------------------

class TestGetSession:
    """GET /chat/session/{id}"""

    def test_get_session_success(self, client, mock_supabase):
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION}])

        msg_tbl = MagicMock()
        msg_result = _mock_table_result(MOCK_MESSAGES)
        msg_tbl.select.return_value.eq.return_value.order.return_value.execute.return_value = msg_result

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "chat_messages": msg_tbl,
        })

        resp = client.get(f"/chat/session/{SESSION_ID}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["session"]["id"] == SESSION_ID
        assert len(body["messages"]) == 2

    def test_get_session_creates_new_session_when_missing(self, client, mock_supabase):
        created_session = {**MOCK_SESSION, "id": "660e8400-e29b-41d4-a716-446655440099"}

        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [])
        session_tbl.insert.return_value.execute.return_value = _mock_table_result([created_session])

        msg_tbl = MagicMock()
        msg_tbl.select.return_value.eq.return_value.order.return_value.execute.return_value = _mock_table_result([])

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "chat_messages": msg_tbl,
        })

        resp = client.get(f"/chat/session/{SESSION_ID}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["session"]["id"] == created_session["id"]
        assert body["session"]["context"] == {}
        assert body["messages"] == []
        session_tbl.insert.assert_called_once_with({
            "user_id": USER_ID,
            "context": {},
            "status": "active",
        })
        msg_tbl.select.return_value.eq.return_value.order.return_value.execute.assert_called_once()

    def test_get_session_wrong_user(self, client, mock_supabase):
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION, "user_id": OTHER_USER_ID}])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.get(f"/chat/session/{SESSION_ID}")
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /chat/message
# ---------------------------------------------------------------------------

class TestSendMessage:
    """POST /chat/message"""

    def test_send_message_success(self, client, mock_supabase, mock_agent):
        # Session lookup
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION}])

        # Message insert
        msg_tbl = MagicMock()
        msg_insert_result = _mock_table_result([{"id": "m3"}])
        msg_tbl.insert.return_value.execute.return_value = msg_insert_result
        # Message history fetch
        msg_tbl.select.return_value.eq.return_value.order.return_value.execute.return_value = _mock_table_result(MOCK_MESSAGES)

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "chat_messages": msg_tbl,
        })

        resp = client.post("/chat/message", json={
            "session_id": SESSION_ID,
            "message": "I want to organize a flyering event",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["session_id"] == SESSION_ID
        assert body["reply"] == "Hello! What would you like to organize?"
        assert "context" in body

    def test_send_message_prepends_previous_session_context(self, client, mock_supabase, mock_agent, monkeypatch):
        monkeypatch.setattr(
            "routers.chat._get_format_history",
            lambda: (lambda rows: [{"role": r["role"], "content": r["content"]} for r in rows]),
        )
        monkeypatch.setattr(
             "routers.chat._load_previous_conversation_context",
             lambda **kwargs: [{"role": "assistant", "content": "Earlier you chose Central Park."}],
        )

        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION}])

        msg_tbl = MagicMock()
        msg_tbl.insert.return_value.execute.return_value = _mock_table_result([{"id": "m3"}])
        msg_tbl.select.return_value.eq.return_value.order.return_value.execute.return_value = _mock_table_result([
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
            {"role": "user", "content": "Can we continue where we left off?"},
        ])

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "chat_messages": msg_tbl,
        })

        resp = client.post("/chat/message", json={
            "session_id": SESSION_ID,
            "message": "Can we continue where we left off?",
        })
        assert resp.status_code == 200

        invoke_payload = mock_agent.invoke.call_args[0][0]
        assert invoke_payload["chat_history"] == [
            {"role": "assistant", "content": "Earlier you chose Central Park."},
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
        ]

    def test_send_message_invalid_body(self, client):
        resp = client.post("/chat/message", json={"session_id": SESSION_ID, "message": ""})
        assert resp.status_code == 422

    def test_send_message_creates_new_session_when_missing(self, client, mock_supabase):
        created_session = {**MOCK_SESSION, "id": "660e8400-e29b-41d4-a716-446655440088"}

        session_tbl = MagicMock()
        session_tbl.select.return_value.eq.return_value.limit.return_value.execute.side_effect = [
            _mock_table_result([]),
            _mock_table_result([created_session]),
        ]
        session_tbl.insert.return_value.execute.return_value = _mock_table_result([created_session])

        msg_tbl = MagicMock()
        msg_tbl.insert.return_value.execute.return_value = _mock_table_result([{"id": "m3"}])
        msg_tbl.select.return_value.eq.return_value.order.return_value.execute.return_value = _mock_table_result([
            {"role": "user", "content": "hello"}
        ])

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "chat_messages": msg_tbl,
        })

        resp = client.post("/chat/message", json={
            "session_id": SESSION_ID,
            "message": "hello",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["session_id"] == created_session["id"]
        assert body["context"] == {}
        session_tbl.insert.assert_called_once_with({
            "user_id": USER_ID,
            "context": {},
            "status": "active",
        })
        assert msg_tbl.insert.call_args_list == [
            call({"session_id": created_session["id"], "role": "user", "content": "hello"}),
            call({
                "session_id": created_session["id"],
                "role": "assistant",
                "content": "Hello! What would you like to organize?",
            }),
        ]

    def test_send_message_wrong_user(self, client, mock_supabase):
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION, "user_id": OTHER_USER_ID}])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.post("/chat/message", json={
            "session_id": SESSION_ID,
            "message": "hello",
        })
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /chat/session/{id}/context  (Tool 1)
# ---------------------------------------------------------------------------

class TestSaveContext:
    """POST /chat/session/{id}/context"""

    def test_save_context_valid_field(self, client, mock_supabase):
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION}])

        update_result = _mock_table_result([{**MOCK_SESSION, "context": {"title": "Park Event"}}])
        session_tbl.update.return_value.eq.return_value.execute.return_value = update_result

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.post(f"/chat/session/{SESSION_ID}/context", json={
            "field": "title",
            "value": "Park Event",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["context"]["title"] == "Park Event"

    def test_save_context_invalid_field(self, client, mock_supabase):
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION}])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.post(f"/chat/session/{SESSION_ID}/context", json={
            "field": "invalid_field_name",
            "value": "test",
        })
        assert resp.status_code == 400

    def test_save_context_normalizes_natural_language_date(self, client, mock_supabase):
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION}])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.post(f"/chat/session/{SESSION_ID}/context", json={
            "field": "date",
            "value": "April 26, 2020",
        })
        assert resp.status_code == 200
        assert resp.json()["context"]["date"] == "2020-04-26"

    def test_save_context_normalizes_natural_language_start_time(self, client, mock_supabase):
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION}])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.post(f"/chat/session/{SESSION_ID}/context", json={
            "field": "start_time",
            "value": "12AM",
        })
        assert resp.status_code == 200
        assert resp.json()["context"]["start_time"] == "00:00"

    def test_save_context_normalizes_natural_language_end_time(self, client, mock_supabase):
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION}])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.post(f"/chat/session/{SESSION_ID}/context", json={
            "field": "end_time",
            "value": "3 PM",
        })
        assert resp.status_code == 200
        assert resp.json()["context"]["end_time"] == "15:00"


# ---------------------------------------------------------------------------
# GET /chat/session/{id}/check-conflicts  (Tool 2)
# ---------------------------------------------------------------------------

class TestCheckConflicts:
    """GET /chat/session/{id}/check-conflicts"""

    def test_check_conflicts_no_conflict(self, client, mock_supabase):
        session_tbl = MagicMock()
        ctx = {**MOCK_SESSION, "context": {
            "location": "Central Park",
            "latitude": 40.785091,
            "longitude": -73.968285,
            "date": "2026-04-15",
        }}
        _set_session_lookup(session_tbl, [ctx])

        camp_tbl = MagicMock()
        camp_result = _mock_table_result([])  # no campaigns on that date
        camp_tbl.select.return_value.eq.return_value.eq.return_value.execute.return_value = camp_result

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "campaigns": camp_tbl,
        })

        resp = client.get(f"/chat/session/{SESSION_ID}/check-conflicts")
        assert resp.status_code == 200
        body = resp.json()
        assert body["has_conflict"] is False
        assert body["conflicts"] == []

    def test_check_conflicts_with_conflict(self, client, mock_supabase):
        session_tbl = MagicMock()
        ctx = {**MOCK_SESSION, "context": {
            "location": "Central Park",
            "latitude": 40.785091,
            "longitude": -73.968285,
            "date": "2026-04-15",
        }}
        _set_session_lookup(session_tbl, [ctx])

        camp_tbl = MagicMock()
        # A campaign very close to the same location
        camp_result = _mock_table_result([{
            "id": "c-nearby",
            "title": "Nearby Event",
            "date": "2026-04-15",
            "start_time": "10:00",
            "latitude": 40.785100,
            "longitude": -73.968300,
        }])
        camp_tbl.select.return_value.eq.return_value.eq.return_value.execute.return_value = camp_result

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "campaigns": camp_tbl,
        })

        resp = client.get(f"/chat/session/{SESSION_ID}/check-conflicts")
        assert resp.status_code == 200
        body = resp.json()
        assert body["has_conflict"] is True
        assert len(body["conflicts"]) == 1

    def test_check_conflicts_missing_location(self, client, mock_supabase):
        session_tbl = MagicMock()
        ctx = {**MOCK_SESSION, "context": {"title": "Event"}}  # no location/coords/date
        _set_session_lookup(session_tbl, [ctx])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.get(f"/chat/session/{SESSION_ID}/check-conflicts")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GET /chat/session/{id}/suggest-pantries  (Tool 3)
# ---------------------------------------------------------------------------

class TestSuggestPantries:
    """GET /chat/session/{id}/suggest-pantries"""

    def test_suggest_pantries_success(self, client, mock_supabase):
        session_tbl = MagicMock()
        ctx = {**MOCK_SESSION, "context": {
            "latitude": 40.785091,
            "longitude": -73.968285,
        }}
        _set_session_lookup(session_tbl, [ctx])

        pantry_tbl = MagicMock()
        pantry_result = _mock_table_result([{
            "id": "p-1",
            "name": "Community Food Bank",
            "latitude": 40.786,
            "longitude": -73.969,
            "services": ["food distribution"],
        }])
        pantry_tbl.select.return_value.execute.return_value = pantry_result

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "food_pantries": pantry_tbl,
        })

        resp = client.get(f"/chat/session/{SESSION_ID}/suggest-pantries")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body["pantries"], list)

    def test_suggest_pantries_geocodes_from_address_and_persists_coords(self, client, mock_supabase, monkeypatch):
        monkeypatch.setattr(
            "routers.chat.geocode_address",
            lambda query: (40.785091, -73.968285) if "123 Main St" in query else None,
        )

        session_tbl = MagicMock()
        ctx = {**MOCK_SESSION, "context": {
            "location": "Central Park",
            "address": "123 Main St, New York, NY",
        }}
        _set_session_lookup(session_tbl, [ctx])
        session_tbl.update.return_value.eq.return_value.execute.return_value = _mock_table_result([{}])

        pantry_tbl = MagicMock()
        pantry_tbl.select.return_value.execute.return_value = _mock_table_result([{
            "id": "p-1",
            "name": "Community Food Bank",
            "latitude": 40.786,
            "longitude": -73.969,
            "services": ["food distribution"],
        }])

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "food_pantries": pantry_tbl,
        })

        resp = client.get(f"/chat/session/{SESSION_ID}/suggest-pantries")
        assert resp.status_code == 200
        assert isinstance(resp.json()["pantries"], list)

        updated_context = session_tbl.update.call_args[0][0]["context"]
        assert updated_context["latitude"] == 40.785091
        assert updated_context["longitude"] == -73.968285

    def test_suggest_pantries_geocode_failure_returns_400(self, client, mock_supabase, monkeypatch):
        monkeypatch.setattr("routers.chat.geocode_address", lambda _query: None)

        session_tbl = MagicMock()
        ctx = {**MOCK_SESSION, "context": {
            "location": "Unknown Place",
            "address": "No Match",
        }}
        _set_session_lookup(session_tbl, [ctx])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.get(f"/chat/session/{SESSION_ID}/suggest-pantries")
        assert resp.status_code == 400

    def test_suggest_pantries_missing_coords(self, client, mock_supabase):
        session_tbl = MagicMock()
        ctx = {**MOCK_SESSION, "context": {"title": "Event"}}  # no coords
        _set_session_lookup(session_tbl, [ctx])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.get(f"/chat/session/{SESSION_ID}/suggest-pantries")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /chat/session/{id}/create-campaign  (Tool 4)
# ---------------------------------------------------------------------------

class TestCreateCampaign:
    """POST /chat/session/{id}/create-campaign"""

    def test_create_campaign_success(self, client, mock_supabase):
        full_context = {
            "title": "Park Flyering",
            "location": "Central Park",
            "address": "123 Park Ave",
            "date": "2026-04-15",
            "start_time": "10:00",
            "end_time": "14:00",
        }
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION, "context": full_context}])
        # Update context with campaign_id after creation
        session_tbl.update.return_value.eq.return_value.execute.return_value = _mock_table_result([{}])

        camp_tbl = MagicMock()
        camp_insert_result = _mock_table_result([{"id": CAMPAIGN_ID, "title": "Park Flyering"}])
        camp_tbl.insert.return_value.execute.return_value = camp_insert_result

        points_tbl = MagicMock()
        points_tbl.insert.return_value.execute.return_value = _mock_table_result([{"id": "pt-1"}])

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "campaigns": camp_tbl,
            "user_points": points_tbl,
        })

        resp = client.post(f"/chat/session/{SESSION_ID}/create-campaign")
        assert resp.status_code == 201
        body = resp.json()
        assert body["campaign_id"] == CAMPAIGN_ID
        assert body["title"] == "Park Flyering"

    def test_create_campaign_missing_fields(self, client, mock_supabase):
        partial_context = {"title": "Park Flyering"}  # missing location, address, etc.
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION, "context": partial_context}])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.post(f"/chat/session/{SESSION_ID}/create-campaign")
        assert resp.status_code == 400
        body = resp.json()
        assert "missing" in body["detail"].lower()


# ---------------------------------------------------------------------------
# POST /chat/session/{id}/generate-flyer  (Tool 5)
# ---------------------------------------------------------------------------

class TestGenerateFlyer:
    """POST /chat/session/{id}/generate-flyer"""

    def test_generate_flyer_success(self, client, mock_supabase):
        session_tbl = MagicMock()
        ctx = {**MOCK_SESSION, "context": {"campaign_id": CAMPAIGN_ID}}
        _set_session_lookup(session_tbl, [ctx])

        template_tbl = MagicMock()
        template_result = _mock_table_result([{
            "id": "tmpl-1",
            "file_url": "https://storage.supabase.co/templates/default.pdf",
            "thumbnail_url": "https://storage.supabase.co/templates/default_thumb.png",
        }])
        template_tbl.select.return_value.eq.return_value.limit.return_value.execute.return_value = template_result

        flyer_tbl = MagicMock()
        flyer_insert_result = _mock_table_result([{"id": "flyer-1"}])
        flyer_tbl.insert.return_value.execute.return_value = flyer_insert_result

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "flyer_templates": template_tbl,
            "campaign_flyers": flyer_tbl,
        })

        resp = client.post(f"/chat/session/{SESSION_ID}/generate-flyer", json={})
        assert resp.status_code == 201
        body = resp.json()
        assert "flyer_url" in body
        assert "thumbnail_url" in body

    def test_generate_flyer_no_campaign(self, client, mock_supabase):
        session_tbl = MagicMock()
        ctx = {**MOCK_SESSION, "context": {}}  # no campaign_id
        _set_session_lookup(session_tbl, [ctx])

        mock_supabase.table.side_effect = _make_table_router({"chat_sessions": session_tbl})

        resp = client.post(f"/chat/session/{SESSION_ID}/generate-flyer", json={})
        assert resp.status_code == 400

    def test_generate_flyer_no_template_found(self, client, mock_supabase):
        """Returns 404 when no flyer template exists."""
        session_tbl = MagicMock()
        ctx = {**MOCK_SESSION, "context": {"campaign_id": CAMPAIGN_ID}}
        _set_session_lookup(session_tbl, [ctx])

        template_tbl = MagicMock()
        template_result = _mock_table_result([])  # no templates
        template_tbl.select.return_value.eq.return_value.limit.return_value.execute.return_value = template_result

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "flyer_templates": template_tbl,
        })

        resp = client.post(f"/chat/session/{SESSION_ID}/generate-flyer", json={})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Additional coverage tests
# ---------------------------------------------------------------------------

class TestSendMessageEdgeCases:
    """Additional edge case tests for POST /chat/message."""

    def test_agent_error_returns_500(self, client, mock_supabase, mock_agent):
        """Returns 500 when the agent executor raises an exception."""
        mock_agent.invoke.side_effect = Exception("AWS Bedrock timeout")

        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION}])

        msg_tbl = MagicMock()
        msg_tbl.insert.return_value.execute.return_value = _mock_table_result([{"id": "m3"}])
        msg_tbl.select.return_value.eq.return_value.order.return_value.execute.return_value = _mock_table_result([])

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "chat_messages": msg_tbl,
        })

        resp = client.post("/chat/message", json={
            "session_id": SESSION_ID,
            "message": "hello",
        })
        assert resp.status_code == 500

    def test_action_set_when_campaign_created(self, client, mock_supabase, mock_agent):
        """Action field is populated when session context has campaign_id."""
        session_with_campaign = {
            **MOCK_SESSION,
            "context": {"campaign_id": CAMPAIGN_ID, "flyer_url": "https://example.com/flyer.pdf"},
        }

        call_count = {"n": 0}

        def session_router(table_name):
            tbl = MagicMock()
            if table_name == "chat_sessions":
                # First call: initial fetch, second call: refresh after agent
                def session_select(*args, **kwargs):
                    m = MagicMock()
                    def eq_fn(*a, **k):
                        m2 = MagicMock()
                        def limit_fn(*_args, **_kwargs):
                            m3 = MagicMock()
                            result = _mock_table_result([session_with_campaign])
                            m3.execute.return_value = result
                            return m3
                        m2.limit.side_effect = limit_fn
                        return m2
                    m.eq.side_effect = eq_fn
                    return m
                tbl.select.side_effect = session_select
            elif table_name == "chat_messages":
                tbl.insert.return_value.execute.return_value = _mock_table_result([{"id": "m3"}])
                tbl.select.return_value.eq.return_value.order.return_value.execute.return_value = _mock_table_result([])
            return tbl

        mock_supabase.table.side_effect = session_router

        resp = client.post("/chat/message", json={
            "session_id": SESSION_ID,
            "message": "hello",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["action"] is not None
        assert body["action"]["type"] == "campaign_created"
        assert body["action"]["campaign_id"] == CAMPAIGN_ID


class TestCreateCampaignEdgeCases:
    """Additional edge cases for campaign creation."""

    def test_create_campaign_with_optional_fields(self, client, mock_supabase):
        """Optional fields like latitude, longitude, max_volunteers are included."""
        full_context = {
            "title": "Park Flyering",
            "location": "Central Park",
            "address": "123 Park Ave",
            "date": "2026-04-15",
            "start_time": "10:00",
            "end_time": "14:00",
            "latitude": 40.785,
            "longitude": -73.968,
            "max_volunteers": 20,
        }
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION, "context": full_context}])
        session_tbl.update.return_value.eq.return_value.execute.return_value = _mock_table_result([{}])

        camp_tbl = MagicMock()
        camp_insert_result = _mock_table_result([{"id": CAMPAIGN_ID, "title": "Park Flyering"}])
        camp_tbl.insert.return_value.execute.return_value = camp_insert_result

        points_tbl = MagicMock()
        points_tbl.insert.return_value.execute.return_value = _mock_table_result([{"id": "pt-1"}])

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "campaigns": camp_tbl,
            "user_points": points_tbl,
        })

        resp = client.post(f"/chat/session/{SESSION_ID}/create-campaign")
        assert resp.status_code == 201

    def test_create_campaign_db_error(self, client, mock_supabase):
        """Returns 500 when campaign insert fails."""
        full_context = {
            "title": "Park Flyering",
            "location": "Central Park",
            "address": "123 Park Ave",
            "date": "2026-04-15",
            "start_time": "10:00",
            "end_time": "14:00",
        }
        session_tbl = MagicMock()
        _set_session_lookup(session_tbl, [{**MOCK_SESSION, "context": full_context}])

        camp_tbl = MagicMock()
        camp_tbl.insert.return_value.execute.side_effect = Exception("DB connection error")

        mock_supabase.table.side_effect = _make_table_router({
            "chat_sessions": session_tbl,
            "campaigns": camp_tbl,
        })

        resp = client.post(f"/chat/session/{SESSION_ID}/create-campaign")
        assert resp.status_code == 500


class TestBedrockExecutorWiring:
    """Unit tests for agent runtime request context injection."""

    def test_executor_passes_messages_session_and_token_to_run_agent(self, monkeypatch):
        from routers.chat import _BedrockGraphExecutor

        captured: dict[str, object] = {}

        async def fake_run_agent(messages, session_id=None, token=None):
            captured["messages"] = messages
            captured["session_id"] = session_id
            captured["token"] = token
            return {"role": "assistant", "content": "ok", "tool_calls": []}

        monkeypatch.setattr("routers.chat.run_agent", fake_run_agent)

        executor = _BedrockGraphExecutor()
        result = executor.invoke({
            "input": "hello",
            "chat_history": [{"role": "assistant", "content": "previous"}],
            "session_id": "session-123",
            "token": "jwt-abc",
        })

        assert result["output"] == "ok"
        assert captured["session_id"] == "session-123"
        assert captured["token"] == "jwt-abc"
        assert captured["messages"] == [
            {"role": "assistant", "content": "previous"},
            {"role": "user", "content": "hello"},
        ]
