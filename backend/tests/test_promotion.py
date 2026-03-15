"""Tests for promotion endpoint (POST /campaigns/{id}/promote)."""

from unittest.mock import MagicMock
from datetime import datetime, timezone


CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440001"
ORGANIZER_ID = "user-uuid-123"
OTHER_USER_ID = "user-uuid-999"

MOCK_CAMPAIGN = {
    "id": CAMPAIGN_ID,
    "organizer_id": ORGANIZER_ID,
    "title": "Park Flyering",
    "status": "published",
    "promoted_at": None,
    "promoted_until": None,
}


class TestPromoteCampaign:
    """POST /campaigns/{id}/promote"""

    def test_promote_success(self, client, mock_supabase):
        """Organizer can promote an unpromoted campaign."""
        campaign_result = MagicMock()
        campaign_result.data = MOCK_CAMPAIGN

        update_result = MagicMock()
        update_result.data = {
            **MOCK_CAMPAIGN,
            "promoted_at": "2026-03-14T10:00:00+00:00",
            "promoted_until": "2026-03-15T10:00:00+00:00",
        }

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
                mock_table.update.return_value.eq.return_value.execute.return_value = update_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/promote")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["promoted_at"] is not None

    def test_promote_campaign_not_found(self, client, mock_supabase):
        """Returns 404 when campaign does not exist."""
        campaign_result = MagicMock()
        campaign_result.data = None

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/promote")
        assert resp.status_code == 404

    def test_promote_not_organizer(self, client, mock_supabase):
        """Returns 403 when user is not the campaign organizer."""
        campaign_result = MagicMock()
        campaign_result.data = {**MOCK_CAMPAIGN, "organizer_id": OTHER_USER_ID}

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/promote")
        assert resp.status_code == 403

    def test_promote_already_promoted(self, client, mock_supabase):
        """Returns 409 when campaign is already promoted."""
        campaign_result = MagicMock()
        campaign_result.data = {
            **MOCK_CAMPAIGN,
            "promoted_at": "2026-03-13T10:00:00+00:00",
            "promoted_until": "2026-03-14T10:00:00+00:00",
        }

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/promote")
        assert resp.status_code == 409
        body = resp.json()
        assert body["code"] == "ALREADY_PROMOTED"
