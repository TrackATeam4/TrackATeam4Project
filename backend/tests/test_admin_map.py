"""Tests for admin user and campaign detail endpoints in routes/map.py."""

import sys
from unittest.mock import MagicMock, patch

import pytest

ADMIN_USER_ID = "admin-uuid-001"
USER_A_ID = "user-uuid-aaa"
USER_B_ID = "user-uuid-bbb"
CAMPAIGN_ID = "campaign-uuid-111"


@pytest.fixture()
def admin_client(mock_supabase):
    """TestClient with admin auth override."""
    from main import app
    from auth import verify_token, get_current_user
    from supabase_client import get_supabase_client

    mock_admin = MagicMock()
    mock_admin.user.id = ADMIN_USER_ID
    mock_admin.user.user_metadata = {"name": "Admin User"}
    mock_admin.id = ADMIN_USER_ID
    mock_admin.email = "admin@example.com"

    async def _override_verify_token():
        return mock_admin

    async def _override_current_user():
        return mock_admin

    def _override_supabase():
        return mock_supabase

    app.dependency_overrides[verify_token] = _override_verify_token
    app.dependency_overrides[get_current_user] = _override_current_user
    app.dependency_overrides[get_supabase_client] = _override_supabase

    # Also patch the direct call sites inside route handlers and get_current_app_user
    sys.modules["supabase_client"].get_supabase_client.return_value = mock_supabase

    from starlette.testclient import TestClient
    with TestClient(app) as tc:
        yield tc

    app.dependency_overrides.clear()


def _make_chain(mock, final_data):
    """Helper: make a mock that chains .select().eq()... and returns final_data on .execute()."""
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.neq.return_value = chain
    chain.in_.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.gte.return_value = chain
    chain.lte.return_value = chain
    execute_result = MagicMock()
    execute_result.data = final_data
    chain.execute.return_value = execute_result
    return chain


class TestAdminUsersVolunteerCount:
    """GET /admin/users — volunteer_count field and sort options."""

    def test_users_include_volunteer_count(self, admin_client, mock_supabase):
        """Each user in the response has a volunteer_count field."""
        users_data = [
            {"id": USER_A_ID, "name": "Alice", "email": "alice@example.com", "role": "volunteer", "created_at": "2025-01-01"},
            {"id": USER_B_ID, "name": "Bob", "email": "bob@example.com", "role": "volunteer", "created_at": "2025-02-01"},
        ]
        points_data = [{"user_id": USER_A_ID, "points": 50}]
        signups_data = [
            {"user_id": USER_A_ID},
            {"user_id": USER_A_ID},
            {"user_id": USER_B_ID},
        ]

        call_count = [0]

        def table_side_effect(table_name):
            chain = _make_chain(mock_supabase, [])
            if table_name == "users":
                chain.execute.return_value.data = users_data
            elif table_name == "user_points":
                chain.execute.return_value.data = points_data
            elif table_name == "signups":
                call_count[0] += 1
                chain.execute.return_value.data = signups_data
            return chain

        mock_supabase.table.side_effect = table_side_effect

        resp = admin_client.get("/admin/users")
        assert resp.status_code == 200
        body = resp.json()
        users = body["data"]["users"]
        assert len(users) == 2
        alice = next(u for u in users if u["id"] == USER_A_ID)
        bob = next(u for u in users if u["id"] == USER_B_ID)
        assert alice["volunteer_count"] == 2
        assert bob["volunteer_count"] == 1

    def test_sort_by_name(self, admin_client, mock_supabase):
        """sort=name returns users sorted alphabetically."""
        users_data = [
            {"id": USER_B_ID, "name": "Zara", "email": "z@example.com", "role": "volunteer", "created_at": "2025-01-01"},
            {"id": USER_A_ID, "name": "Alice", "email": "a@example.com", "role": "volunteer", "created_at": "2025-02-01"},
        ]

        def table_side_effect(table_name):
            chain = _make_chain(mock_supabase, [])
            if table_name == "users":
                chain.execute.return_value.data = users_data
            return chain

        mock_supabase.table.side_effect = table_side_effect

        resp = admin_client.get("/admin/users?sort=name")
        assert resp.status_code == 200
        names = [u["name"] for u in resp.json()["data"]["users"]]
        assert names == sorted(names, key=str.lower)

    def test_sort_by_created_at(self, admin_client, mock_supabase):
        """sort=created_at returns users newest-first."""
        users_data = [
            {"id": USER_A_ID, "name": "Alice", "email": "a@example.com", "role": "volunteer", "created_at": "2024-01-01"},
            {"id": USER_B_ID, "name": "Bob", "email": "b@example.com", "role": "volunteer", "created_at": "2025-06-01"},
        ]

        def table_side_effect(table_name):
            chain = _make_chain(mock_supabase, [])
            if table_name == "users":
                chain.execute.return_value.data = users_data
            return chain

        mock_supabase.table.side_effect = table_side_effect

        resp = admin_client.get("/admin/users?sort=created_at")
        assert resp.status_code == 200
        dates = [u["created_at"] for u in resp.json()["data"]["users"]]
        assert dates == sorted(dates, reverse=True)


class TestAdminCampaignDetailSignups:
    """GET /admin/campaigns/{id} — enriched signups list."""

    def test_campaign_detail_includes_signups(self, admin_client, mock_supabase):
        """Campaign detail response includes enriched signups with user info."""
        campaign_data = {
            "id": CAMPAIGN_ID, "title": "Test Campaign", "status": "published",
            "organizer_id": "org-111", "date": "2025-05-01",
        }
        signups_data = [
            {"id": "sig-1", "user_id": USER_A_ID, "status": "confirmed", "joined_at": "2025-04-01"},
            {"id": "sig-2", "user_id": USER_B_ID, "status": "pending", "joined_at": "2025-04-02"},
        ]
        users_data = [
            {"id": USER_A_ID, "name": "Alice", "email": "alice@example.com"},
            {"id": USER_B_ID, "name": "Bob", "email": "bob@example.com"},
        ]

        def table_side_effect(table_name):
            chain = _make_chain(mock_supabase, [])
            if table_name == "campaigns":
                chain.execute.return_value.data = [campaign_data]
            elif table_name == "users":
                chain.execute.return_value.data = users_data
            elif table_name == "tasks":
                chain.execute.return_value.data = []
            elif table_name == "signups":
                chain.execute.return_value.data = signups_data
            return chain

        mock_supabase.table.side_effect = table_side_effect

        resp = admin_client.get(f"/admin/campaigns/{CAMPAIGN_ID}")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "signups" in data
        assert data["signup_count"] == 2

        signups = data["signups"]
        alice = next(s for s in signups if s["user_id"] == USER_A_ID)
        bob = next(s for s in signups if s["user_id"] == USER_B_ID)
        assert alice["user_name"] == "Alice"
        assert alice["attended"] is True
        assert bob["user_name"] == "Bob"
        assert bob["attended"] is False
        assert bob["status"] == "pending"
