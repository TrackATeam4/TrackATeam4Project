"""Tests for Volunteer Campaign CRUD endpoints."""

from unittest.mock import MagicMock
import json

import pytest
from starlette.testclient import TestClient


@pytest.fixture(autouse=True)
def log_api_responses(monkeypatch):
    """Print the response body for every API call in this module."""
    original_request = TestClient.request

    def wrapped_request(self, method, url, *args, **kwargs):
        response = original_request(self, method, url, *args, **kwargs)
        try:
            payload = response.json()
            payload_str = json.dumps(payload, indent=2, sort_keys=True)
        except ValueError:
            payload_str = response.text

        print(f"\n[API RESPONSE BODY] {method} {url}:\n{payload_str}\n")
        return response

    monkeypatch.setattr(TestClient, "request", wrapped_request)


# ── Constants ─────────────────────────────────────────────────────────────────

CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440001"
OTHER_CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440099"
ORGANIZER_ID = "user-uuid-123"  # matches mock_user fixture id
OTHER_USER_ID = "user-uuid-999"
TEMPLATE_ID = "550e8400-e29b-41d4-a716-446655440002"
PANTRY_ID = "550e8400-e29b-41d4-a716-446655440003"
INVALID_UUID = "not-a-valid-uuid"

MOCK_CAMPAIGN = {
    "id": CAMPAIGN_ID,
    "organizer_id": ORGANIZER_ID,
    "title": "Hyde Park Flyering",
    "description": "Distribute flyers at the park",
    "location": "Hyde Park",
    "address": "5100 S Lake Shore Dr",
    "latitude": 41.7943,
    "longitude": -87.5907,
    "date": "2026-03-21",
    "start_time": "10:00",
    "end_time": "13:00",
    "max_volunteers": 10,
    "target_flyers": 500,
    "flyer_template_id": TEMPLATE_ID,
    "food_pantry_id": PANTRY_ID,
    "tags": ["families", "south_side", "weekend"],
    "status": "draft",
    "promoted_at": None,
    "promoted_until": None,
    "created_at": "2026-03-14T10:00:00+00:00",
    "updated_at": "2026-03-14T10:00:00+00:00",
}

VALID_CREATE_BODY = {
    "title": "Hyde Park Flyering",
    "description": "Distribute flyers at the park",
    "location": "Hyde Park",
    "address": "5100 S Lake Shore Dr",
    "latitude": 41.7943,
    "longitude": -87.5907,
    "date": "2026-03-21",
    "start_time": "10:00",
    "end_time": "13:00",
    "max_volunteers": 10,
    "target_flyers": 500,
    "flyer_template_id": TEMPLATE_ID,
    "food_pantry_id": PANTRY_ID,
    "tags": ["families", "south_side", "weekend"],
}


# ── Mock helpers ──────────────────────────────────────────────────────────────


def _make_table_router(
    campaign_data=None,
    insert_data=None,
    update_data=None,
    signups_data=None,
    campaigns_list_data=None,
):
    """
    Build a generic table() side_effect that supports:
    - single campaign lookup via .select().eq().single().execute()
    - list campaign query via .select().eq()/.in_().order().range().execute()
    - insert via .insert().execute()
    - update via .update().eq().execute()
    - signups select via .select().eq().execute()
    """

    def table_router(table_name):
        mock_table = MagicMock()

        if table_name == "campaigns":
            # Shared chain for list-style queries (eq/in_/order/range are all fluent)
            chain = mock_table.select.return_value
            chain.eq.return_value = chain
            chain.in_.return_value = chain
            chain.order.return_value = chain
            chain.range.return_value = chain
            list_result = MagicMock()
            list_result.data = (
                campaigns_list_data if campaigns_list_data is not None else []
            )
            chain.execute.return_value = list_result

            # Single-item lookup layered on top: .eq().single().execute()
            single_result = MagicMock()
            single_result.data = campaign_data
            chain.single.return_value.execute.return_value = single_result

            # Insert
            insert_result = MagicMock()
            insert_result.data = [insert_data] if insert_data else []
            mock_table.insert.return_value.execute.return_value = insert_result

            # Update
            update_result = MagicMock()
            update_result.data = [update_data] if update_data else []
            mock_table.update.return_value.eq.return_value.execute.return_value = (
                update_result
            )

        elif table_name == "signups":
            signup_result = MagicMock()
            signup_result.data = signups_data if signups_data is not None else []
            chain = mock_table.select.return_value
            chain.eq.return_value = chain
            chain.execute.return_value = signup_result

        return mock_table

    return table_router


# ── POST /campaigns ───────────────────────────────────────────────────────────


class TestCreateCampaign:
    """POST /campaigns"""

    def test_create_success(self, client, mock_supabase):
        """Authenticated user can create a campaign; returns 201 with campaign data."""
        mock_supabase.table.side_effect = _make_table_router(insert_data=MOCK_CAMPAIGN)

        resp = client.post("/campaigns", json=VALID_CREATE_BODY)

        assert resp.status_code == 201
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["title"] == "Hyde Park Flyering"
        assert body["data"]["organizer_id"] == ORGANIZER_ID
        assert body["data"]["status"] == "draft"

    def test_create_minimal_required_fields_only(self, client, mock_supabase):
        """Create succeeds with only required fields; optional fields can be omitted."""
        minimal_body = {
            "title": "Minimal Campaign",
            "location": "Downtown",
            "address": "123 Main St",
            "date": "2026-04-01",
            "start_time": "09:00",
            "end_time": "12:00",
            "target_flyers": 100,
        }
        minimal_campaign = {
            **MOCK_CAMPAIGN,
            **minimal_body,
            "description": None,
            "food_pantry_id": None,
            "flyer_template_id": None,
            "max_volunteers": None,
            "tags": [],
        }
        mock_supabase.table.side_effect = _make_table_router(
            insert_data=minimal_campaign
        )

        resp = client.post("/campaigns", json=minimal_body)
        assert resp.status_code == 201
        assert resp.json()["success"] is True

    def test_create_without_auth_returns_401(self, unauth_client, mock_supabase):
        """Returns 401 when no Authorization header is provided."""
        resp = unauth_client.post("/campaigns", json=VALID_CREATE_BODY)
        assert resp.status_code == 401

    def test_create_missing_title_returns_422(self, client, mock_supabase):
        """Returns 422 when required field 'title' is missing."""
        body = {k: v for k, v in VALID_CREATE_BODY.items() if k != "title"}
        resp = client.post("/campaigns", json=body)
        assert resp.status_code == 422

    def test_create_missing_location_returns_422(self, client, mock_supabase):
        """Returns 422 when required field 'location' is missing."""
        body = {k: v for k, v in VALID_CREATE_BODY.items() if k != "location"}
        resp = client.post("/campaigns", json=body)
        assert resp.status_code == 422

    def test_create_missing_date_returns_422(self, client, mock_supabase):
        """Returns 422 when required field 'date' is missing."""
        body = {k: v for k, v in VALID_CREATE_BODY.items() if k != "date"}
        resp = client.post("/campaigns", json=body)
        assert resp.status_code == 422

    def test_create_invalid_date_format_returns_422(self, client, mock_supabase):
        """Returns 422 when date is not in YYYY-MM-DD format."""
        resp = client.post(
            "/campaigns", json={**VALID_CREATE_BODY, "date": "21-03-2026"}
        )
        assert resp.status_code == 422

    def test_create_invalid_start_time_format_returns_422(self, client, mock_supabase):
        """Returns 422 when start_time is not a valid time string."""
        resp = client.post(
            "/campaigns", json={**VALID_CREATE_BODY, "start_time": "10am"}
        )
        assert resp.status_code == 422

    def test_create_with_seconds_in_time_succeeds(self, client, mock_supabase):
        """Frontend sends HH:MM:SS — backend must accept it (regression test for #33)."""
        mock_supabase.table.side_effect = _make_table_router(insert_data=MOCK_CAMPAIGN)
        body = {**VALID_CREATE_BODY, "start_time": "10:00:00", "end_time": "13:00:00"}
        resp = client.post("/campaigns", json=body)
        assert resp.status_code == 201

    def test_create_with_status_published(self, client, mock_supabase):
        """Frontend can set status=published when creating a campaign."""
        published_campaign = {**MOCK_CAMPAIGN, "status": "published"}
        mock_supabase.table.side_effect = _make_table_router(insert_data=published_campaign)
        body = {**VALID_CREATE_BODY, "status": "published"}
        resp = client.post("/campaigns", json=body)
        assert resp.status_code == 201
        assert resp.json()["data"]["status"] == "published"

    def test_create_invalid_end_time_format_returns_422(self, client, mock_supabase):
        """Returns 422 when end_time contains extra characters."""
        resp = client.post("/campaigns", json={**VALID_CREATE_BODY, "end_time": "1pm"})
        assert resp.status_code == 422

    def test_create_invalid_flyer_template_uuid_returns_422(
        self, client, mock_supabase
    ):
        """Returns 422 when flyer_template_id is not a valid UUID."""
        resp = client.post(
            "/campaigns", json={**VALID_CREATE_BODY, "flyer_template_id": INVALID_UUID}
        )
        assert resp.status_code == 422

    def test_create_invalid_food_pantry_uuid_returns_422(self, client, mock_supabase):
        """Returns 422 when food_pantry_id is not a valid UUID."""
        resp = client.post(
            "/campaigns", json={**VALID_CREATE_BODY, "food_pantry_id": INVALID_UUID}
        )
        assert resp.status_code == 422

    def test_create_invalid_latitude_returns_422(self, client, mock_supabase):
        """Returns 422 when latitude exceeds valid range."""
        resp = client.post("/campaigns", json={**VALID_CREATE_BODY, "latitude": 200.0})
        assert resp.status_code == 422

    def test_create_invalid_longitude_returns_422(self, client, mock_supabase):
        """Returns 422 when longitude exceeds valid range."""
        resp = client.post(
            "/campaigns", json={**VALID_CREATE_BODY, "longitude": -400.0}
        )
        assert resp.status_code == 422

    def test_create_negative_target_flyers_returns_422(self, client, mock_supabase):
        """Returns 422 when target_flyers is negative."""
        resp = client.post(
            "/campaigns", json={**VALID_CREATE_BODY, "target_flyers": -1}
        )
        assert resp.status_code == 422

    def test_create_max_volunteers_below_one_returns_422(self, client, mock_supabase):
        """Returns 422 when max_volunteers is less than 1."""
        resp = client.post(
            "/campaigns", json={**VALID_CREATE_BODY, "max_volunteers": 0}
        )
        assert resp.status_code == 422

    def test_create_db_error_returns_500(self, client, mock_supabase):
        """Returns 500 when Supabase insert raises an unexpected exception."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                mock_table.insert.return_value.execute.side_effect = Exception(
                    "DB connection lost"
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post("/campaigns", json=VALID_CREATE_BODY)
        assert resp.status_code == 500


# ── GET /campaigns/mine ───────────────────────────────────────────────────────


class TestGetMyCampaigns:
    """GET /campaigns/mine"""

    def test_returns_own_campaigns(self, client, mock_supabase):
        """Returns the list of campaigns created by the authenticated user."""
        mock_supabase.table.side_effect = _make_table_router(
            campaigns_list_data=[MOCK_CAMPAIGN]
        )

        resp = client.get("/campaigns/mine")

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)
        assert len(body["data"]) == 1
        assert body["data"][0]["id"] == CAMPAIGN_ID

    def test_returns_empty_list_when_no_campaigns(self, client, mock_supabase):
        """Returns empty data list when user has not created any campaigns."""
        mock_supabase.table.side_effect = _make_table_router(campaigns_list_data=[])

        resp = client.get("/campaigns/mine")

        assert resp.status_code == 200
        assert resp.json()["data"] == []

    def test_pagination_meta_present(self, client, mock_supabase):
        """Response includes pagination meta reflecting requested page and limit."""
        mock_supabase.table.side_effect = _make_table_router(
            campaigns_list_data=[MOCK_CAMPAIGN]
        )

        resp = client.get("/campaigns/mine?page=2&limit=5")

        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["page"] == 2
        assert body["meta"]["limit"] == 5

    def test_returns_multiple_campaigns(self, client, mock_supabase):
        """Returns all campaigns when user has created multiple."""
        second = {**MOCK_CAMPAIGN, "id": OTHER_CAMPAIGN_ID, "title": "Second Campaign"}
        mock_supabase.table.side_effect = _make_table_router(
            campaigns_list_data=[MOCK_CAMPAIGN, second]
        )

        resp = client.get("/campaigns/mine")
        assert resp.status_code == 200
        assert len(resp.json()["data"]) == 2

    def test_requires_auth_returns_401(self, unauth_client, mock_supabase):
        """Returns 401 when no Authorization header is provided."""
        resp = unauth_client.get("/campaigns/mine")
        assert resp.status_code == 401

    def test_invalid_page_param_returns_422(self, client, mock_supabase):
        """Returns 422 when page=0 (must be >= 1)."""
        resp = client.get("/campaigns/mine?page=0")
        assert resp.status_code == 422

    def test_invalid_limit_param_returns_422(self, client, mock_supabase):
        """Returns 422 when limit exceeds maximum of 100."""
        resp = client.get("/campaigns/mine?limit=200")
        assert resp.status_code == 422


# ── GET /campaigns/joined ─────────────────────────────────────────────────────


class TestGetJoinedCampaigns:
    """GET /campaigns/joined"""

    def test_returns_joined_campaigns(self, client, mock_supabase):
        """Returns campaigns the user has signed up for."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "signups":
                result = MagicMock()
                result.data = [{"campaign_id": CAMPAIGN_ID}]
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    result
                )
            elif table_name == "campaigns":
                result = MagicMock()
                result.data = [MOCK_CAMPAIGN]
                chain = mock_table.select.return_value
                chain.in_.return_value = chain
                chain.order.return_value = chain
                chain.range.return_value = chain
                chain.execute.return_value = result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.get("/campaigns/joined")

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert len(body["data"]) == 1
        assert body["data"][0]["id"] == CAMPAIGN_ID

    def test_no_signups_returns_empty_list(self, client, mock_supabase):
        """Returns empty list and skips campaign query when user has no signups."""
        mock_supabase.table.side_effect = _make_table_router(signups_data=[])

        resp = client.get("/campaigns/joined")

        assert resp.status_code == 200
        body = resp.json()
        assert body["data"] == []

    def test_requires_auth_returns_401(self, unauth_client, mock_supabase):
        """Returns 401 when no Authorization header is provided."""
        resp = unauth_client.get("/campaigns/joined")
        assert resp.status_code == 401

    def test_pagination_meta_present(self, client, mock_supabase):
        """Response includes pagination meta."""
        mock_supabase.table.side_effect = _make_table_router(signups_data=[])

        resp = client.get("/campaigns/joined?page=1&limit=10")

        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["page"] == 1
        assert body["meta"]["limit"] == 10

    def test_invalid_page_returns_422(self, client, mock_supabase):
        """Returns 422 when page is below minimum."""
        resp = client.get("/campaigns/joined?page=0")
        assert resp.status_code == 422

    def test_invalid_limit_returns_422(self, client, mock_supabase):
        """Returns 422 when limit is above maximum."""
        resp = client.get("/campaigns/joined?limit=500")
        assert resp.status_code == 422


# ── GET /campaigns/{id} ───────────────────────────────────────────────────────


class TestGetCampaign:
    """GET /campaigns/{id} — public endpoint"""

    def test_returns_campaign_without_auth(self, unauth_client, mock_supabase):
        """Public endpoint: returns campaign data without an Authorization header."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                result = MagicMock()
                result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                    result
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = unauth_client.get(f"/campaigns/{CAMPAIGN_ID}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["id"] == CAMPAIGN_ID
        assert body["data"]["title"] == "Hyde Park Flyering"

    def test_returns_campaign_with_auth(self, client, mock_supabase):
        """Also accessible when authenticated."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                result = MagicMock()
                result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                    result
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.get(f"/campaigns/{CAMPAIGN_ID}")
        assert resp.status_code == 200

    def test_campaign_not_found_returns_404(self, unauth_client, mock_supabase):
        """Returns 404 when no campaign matches the given ID."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                result = MagicMock()
                result.data = None
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                    result
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = unauth_client.get(f"/campaigns/{CAMPAIGN_ID}")
        assert resp.status_code == 404

    def test_invalid_uuid_returns_422(self, unauth_client, mock_supabase):
        """Returns 422 when campaign_id path parameter is not a valid UUID."""
        resp = unauth_client.get(f"/campaigns/{INVALID_UUID}")
        assert resp.status_code == 422


# ── PUT /campaigns/{id} ───────────────────────────────────────────────────────


class TestUpdateCampaign:
    """PUT /campaigns/{id}"""

    def test_update_title_success(self, client, mock_supabase):
        """Organizer can update the campaign title."""
        updated = {**MOCK_CAMPAIGN, "title": "Updated Title"}

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                single_result = MagicMock()
                single_result.data = MOCK_CAMPAIGN
                chain.single.return_value.execute.return_value = single_result

                update_result = MagicMock()
                update_result.data = [updated]
                mock_table.update.return_value.eq.return_value.execute.return_value = (
                    update_result
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.put(f"/campaigns/{CAMPAIGN_ID}", json={"title": "Updated Title"})

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["title"] == "Updated Title"

    def test_update_multiple_fields(self, client, mock_supabase):
        """Organizer can update multiple fields at once."""
        updated = {**MOCK_CAMPAIGN, "title": "New Title", "max_volunteers": 25}

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                single_result = MagicMock()
                single_result.data = MOCK_CAMPAIGN
                chain.single.return_value.execute.return_value = single_result

                update_result = MagicMock()
                update_result.data = [updated]
                mock_table.update.return_value.eq.return_value.execute.return_value = (
                    update_result
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.put(
            f"/campaigns/{CAMPAIGN_ID}",
            json={"title": "New Title", "max_volunteers": 25},
        )
        assert resp.status_code == 200

    def test_update_status_to_published(self, client, mock_supabase):
        """Organizer can change campaign status to 'published'."""
        updated = {**MOCK_CAMPAIGN, "status": "published"}

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                single_result = MagicMock()
                single_result.data = MOCK_CAMPAIGN
                chain.single.return_value.execute.return_value = single_result

                update_result = MagicMock()
                update_result.data = [updated]
                mock_table.update.return_value.eq.return_value.execute.return_value = (
                    update_result
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.put(f"/campaigns/{CAMPAIGN_ID}", json={"status": "published"})
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "published"

    def test_update_campaign_not_found_returns_404(self, client, mock_supabase):
        """Returns 404 when campaign does not exist."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                result = MagicMock()
                result.data = None
                chain.single.return_value.execute.return_value = result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.put(f"/campaigns/{CAMPAIGN_ID}", json={"title": "Anything"})
        assert resp.status_code == 404

    def test_update_not_organizer_returns_403(self, client, mock_supabase):
        """Returns 403 when the authenticated user is not the campaign organizer."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                result = MagicMock()
                result.data = {**MOCK_CAMPAIGN, "organizer_id": OTHER_USER_ID}
                chain.single.return_value.execute.return_value = result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.put(f"/campaigns/{CAMPAIGN_ID}", json={"title": "Hijacked"})
        assert resp.status_code == 403

    def test_update_empty_body_returns_current_campaign(self, client, mock_supabase):
        """Empty body returns the existing campaign without touching the DB update path."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                result = MagicMock()
                result.data = MOCK_CAMPAIGN
                chain.single.return_value.execute.return_value = result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.put(f"/campaigns/{CAMPAIGN_ID}", json={})

        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["id"] == CAMPAIGN_ID
        # update() should NOT have been called
        mock_supabase.table.return_value.update.assert_not_called()

    def test_update_invalid_uuid_returns_422(self, client, mock_supabase):
        """Returns 422 when campaign_id is not a valid UUID."""
        resp = client.put(f"/campaigns/{INVALID_UUID}", json={"title": "x"})
        assert resp.status_code == 422

    def test_update_invalid_status_value_returns_422(self, client, mock_supabase):
        """Returns 422 when status is not one of the valid enum values."""
        resp = client.put(
            f"/campaigns/{CAMPAIGN_ID}", json={"status": "unknown_status"}
        )
        assert resp.status_code == 422

    def test_update_invalid_date_format_returns_422(self, client, mock_supabase):
        """Returns 422 when date field has wrong format."""
        resp = client.put(f"/campaigns/{CAMPAIGN_ID}", json={"date": "2026/03/21"})
        assert resp.status_code == 422

    def test_update_invalid_time_format_returns_422(self, client, mock_supabase):
        """Returns 422 when start_time field has wrong format."""
        resp = client.put(f"/campaigns/{CAMPAIGN_ID}", json={"start_time": "10am"})
        assert resp.status_code == 422

    def test_update_db_error_returns_500(self, client, mock_supabase):
        """Returns 500 when Supabase update raises an unexpected exception."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                single_result = MagicMock()
                single_result.data = MOCK_CAMPAIGN
                chain.single.return_value.execute.return_value = single_result
                mock_table.update.return_value.eq.return_value.execute.side_effect = (
                    Exception("DB error")
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.put(f"/campaigns/{CAMPAIGN_ID}", json={"title": "Crash"})
        assert resp.status_code == 500

    def test_update_requires_auth_returns_401(self, unauth_client, mock_supabase):
        """Returns 401 when no Authorization header is provided."""
        resp = unauth_client.put(f"/campaigns/{CAMPAIGN_ID}", json={"title": "x"})
        assert resp.status_code == 401


# ── DELETE /campaigns/{id} ────────────────────────────────────────────────────


class TestDeleteCampaign:
    """DELETE /campaigns/{id}"""

    def test_delete_success(self, client, mock_supabase):
        """Organizer can soft-delete a campaign; response confirms cancellation."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                single_result = MagicMock()
                single_result.data = MOCK_CAMPAIGN
                chain.single.return_value.execute.return_value = single_result

                update_result = MagicMock()
                update_result.data = [{**MOCK_CAMPAIGN, "status": "cancelled"}]
                mock_table.update.return_value.eq.return_value.execute.return_value = (
                    update_result
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.delete(f"/campaigns/{CAMPAIGN_ID}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["id"] == CAMPAIGN_ID
        assert body["data"]["status"] == "cancelled"

    def test_delete_is_soft_delete_not_hard_delete(self, client, mock_supabase):
        """Delete sets status='cancelled' via update(); does not call delete()."""
        captured_update_payload = []

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                single_result = MagicMock()
                single_result.data = MOCK_CAMPAIGN
                chain.single.return_value.execute.return_value = single_result

                def capture_update(data):
                    captured_update_payload.append(data)
                    m = MagicMock()
                    m.eq.return_value.execute.return_value = MagicMock()
                    return m

                mock_table.update.side_effect = capture_update
            return mock_table

        mock_supabase.table.side_effect = table_router

        client.delete(f"/campaigns/{CAMPAIGN_ID}")

        assert captured_update_payload, "Expected update() to be called"
        assert captured_update_payload[0] == {"status": "cancelled"}

    def test_delete_campaign_not_found_returns_404(self, client, mock_supabase):
        """Returns 404 when campaign does not exist."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                result = MagicMock()
                result.data = None
                chain.single.return_value.execute.return_value = result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.delete(f"/campaigns/{CAMPAIGN_ID}")
        assert resp.status_code == 404

    def test_delete_not_organizer_returns_403(self, client, mock_supabase):
        """Returns 403 when the authenticated user is not the campaign organizer."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                result = MagicMock()
                result.data = {**MOCK_CAMPAIGN, "organizer_id": OTHER_USER_ID}
                chain.single.return_value.execute.return_value = result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.delete(f"/campaigns/{CAMPAIGN_ID}")
        assert resp.status_code == 403

    def test_delete_invalid_uuid_returns_422(self, client, mock_supabase):
        """Returns 422 when campaign_id path parameter is not a valid UUID."""
        resp = client.delete(f"/campaigns/{INVALID_UUID}")
        assert resp.status_code == 422

    def test_delete_db_error_returns_500(self, client, mock_supabase):
        """Returns 500 when Supabase update call raises an unexpected exception."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                single_result = MagicMock()
                single_result.data = MOCK_CAMPAIGN
                chain.single.return_value.execute.return_value = single_result
                mock_table.update.return_value.eq.return_value.execute.side_effect = (
                    Exception("DB error")
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.delete(f"/campaigns/{CAMPAIGN_ID}")
        assert resp.status_code == 500

    def test_delete_requires_auth_returns_401(self, unauth_client, mock_supabase):
        """Returns 401 when no Authorization header is provided."""
        resp = unauth_client.delete(f"/campaigns/{CAMPAIGN_ID}")
        assert resp.status_code == 401


VOLUNTEER_ID = "550e8400-e29b-41d4-a716-446655440777"


# ── POST /campaigns/{id}/signup ──────────────────────────────────────────────


class TestSignUpForCampaign:
    """POST /campaigns/{id}/signup"""

    def test_signup_success(self, client, mock_supabase):
        """Volunteer can sign up for an existing campaign."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "signups":
                existing_result = MagicMock()
                existing_result.data = []
                created_result = MagicMock()
                created_result.data = [
                    {
                        "id": "signup-1",
                        "campaign_id": CAMPAIGN_ID,
                        "user_id": ORGANIZER_ID,
                        "status": "pending",
                        "task_id": None,
                    }
                ]
                select_chain = mock_table.select.return_value
                select_chain.eq.return_value = select_chain
                select_chain.execute.return_value = existing_result
                mock_table.insert.return_value.execute.return_value = created_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/signup")
        assert resp.status_code == 201
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["status"] == "pending"

    def test_signup_duplicate_returns_409(self, client, mock_supabase):
        """Duplicate pending/confirmed signup is rejected."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "signups":
                existing_result = MagicMock()
                existing_result.data = [{"id": "signup-1", "status": "pending"}]
                select_chain = mock_table.select.return_value
                select_chain.eq.return_value = select_chain
                select_chain.execute.return_value = existing_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/signup")
        assert resp.status_code == 409

    def test_signup_reactivates_cancelled_signup(self, client, mock_supabase):
        """Cancelled signup can be reactivated to pending."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "signups":
                existing_result = MagicMock()
                existing_result.data = [{"id": "signup-1", "status": "cancelled"}]
                updated_result = MagicMock()
                updated_result.data = [{"id": "signup-1", "status": "pending"}]
                select_chain = mock_table.select.return_value
                select_chain.eq.return_value = select_chain
                select_chain.execute.return_value = existing_result
                mock_table.update.return_value.eq.return_value.execute.return_value = updated_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/signup")
        assert resp.status_code == 201
        assert resp.json()["data"]["status"] == "pending"


# ── DELETE /campaigns/{id}/signup ────────────────────────────────────────────


class TestWithdrawSignup:
    """DELETE /campaigns/{id}/signup"""

    def test_withdraw_success(self, client, mock_supabase):
        """Volunteer can cancel an existing signup."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "signups":
                existing_result = MagicMock()
                existing_result.data = [{"id": "signup-1", "status": "pending"}]
                updated_result = MagicMock()
                updated_result.data = [{"id": "signup-1", "status": "cancelled"}]
                select_chain = mock_table.select.return_value
                select_chain.eq.return_value = select_chain
                select_chain.execute.return_value = existing_result
                mock_table.update.return_value.eq.return_value.execute.return_value = updated_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.delete(f"/campaigns/{CAMPAIGN_ID}/signup")
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "cancelled"

    def test_withdraw_not_found_returns_404(self, client, mock_supabase):
        """Returns 404 when signup does not exist for this user/campaign."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "signups":
                existing_result = MagicMock()
                existing_result.data = []
                select_chain = mock_table.select.return_value
                select_chain.eq.return_value = select_chain
                select_chain.execute.return_value = existing_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.delete(f"/campaigns/{CAMPAIGN_ID}/signup")
        assert resp.status_code == 404


# ── GET /campaigns/{id}/signups ──────────────────────────────────────────────


class TestGetCampaignSignups:
    """GET /campaigns/{id}/signups"""

    def test_list_signups_organizer_only_success(self, client, mock_supabase):
        """Organizer can list signups for their campaign."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "signups":
                list_result = MagicMock()
                list_result.data = [
                    {
                        "id": "signup-1",
                        "campaign_id": CAMPAIGN_ID,
                        "user_id": VOLUNTEER_ID,
                        "status": "pending",
                        "joined_at": "2026-03-14T10:00:00+00:00",
                        "task_id": None,
                    }
                ]
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                chain.order.return_value = chain
                chain.execute.return_value = list_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.get(f"/campaigns/{CAMPAIGN_ID}/signups")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert len(body["data"]) == 1

    def test_list_signups_not_organizer_returns_403(self, client, mock_supabase):
        """Non-organizer cannot list signups."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = {**MOCK_CAMPAIGN, "organizer_id": OTHER_USER_ID}
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.get(f"/campaigns/{CAMPAIGN_ID}/signups")
        assert resp.status_code == 403


# ── POST /campaigns/{id}/confirm/{uid} ───────────────────────────────────────


class TestConfirmAttendance:
    """POST /campaigns/{id}/confirm/{uid}"""

    def test_confirm_success_updates_status_and_awards_points(self, client, mock_supabase):
        """Organizer confirms attendance and volunteer gets points."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "signups":
                existing_result = MagicMock()
                existing_result.data = [
                    {
                        "id": "signup-1",
                        "campaign_id": CAMPAIGN_ID,
                        "user_id": VOLUNTEER_ID,
                        "status": "pending",
                    }
                ]
                updated_result = MagicMock()
                updated_result.data = [
                    {
                        "id": "signup-1",
                        "campaign_id": CAMPAIGN_ID,
                        "user_id": VOLUNTEER_ID,
                        "status": "confirmed",
                    }
                ]
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                chain.execute.return_value = existing_result
                mock_table.update.return_value.eq.return_value.execute.return_value = updated_result
            elif table_name == "user_points":
                points_result = MagicMock()
                points_result.data = [{"id": "points-1"}]
                mock_table.insert.return_value.execute.return_value = points_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/confirm/{VOLUNTEER_ID}")
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "confirmed"

    def test_confirm_not_organizer_returns_403(self, client, mock_supabase):
        """Non-organizer cannot confirm attendance."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = {**MOCK_CAMPAIGN, "organizer_id": OTHER_USER_ID}
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/confirm/{VOLUNTEER_ID}")
        assert resp.status_code == 403

    def test_confirm_missing_signup_returns_404(self, client, mock_supabase):
        """Returns 404 when volunteer is not signed up."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "signups":
                existing_result = MagicMock()
                existing_result.data = []
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                chain.execute.return_value = existing_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/confirm/{VOLUNTEER_ID}")
        assert resp.status_code == 404

    def test_confirm_cancelled_signup_returns_400(self, client, mock_supabase):
        """Cancelled signup cannot be confirmed."""

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                campaign_result = MagicMock()
                campaign_result.data = MOCK_CAMPAIGN
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "signups":
                existing_result = MagicMock()
                existing_result.data = [
                    {
                        "id": "signup-1",
                        "campaign_id": CAMPAIGN_ID,
                        "user_id": VOLUNTEER_ID,
                        "status": "cancelled",
                    }
                ]
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                chain.execute.return_value = existing_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/confirm/{VOLUNTEER_ID}")
        assert resp.status_code == 400
