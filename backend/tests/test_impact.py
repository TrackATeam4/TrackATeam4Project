"""Tests for impact report endpoints (POST & GET /campaigns/{id}/impact)."""

from unittest.mock import MagicMock, patch


CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440001"
ORGANIZER_ID = "user-uuid-123"
OTHER_USER_ID = "user-uuid-999"

MOCK_CAMPAIGN = {
    "id": CAMPAIGN_ID,
    "organizer_id": ORGANIZER_ID,
    "title": "Park Flyering",
    "status": "completed",
}

VALID_REPORT_BODY = {
    "flyers_distributed": 430,
    "families_reached": 120,
    "volunteers_attended": 8,
    "notes": "Great turnout near the park entrance.",
    "photos": ["https://storage.supabase.co/photo1.jpg"],
}

MOCK_REPORT_ROW = {
    "id": "report-uuid-001",
    "campaign_id": CAMPAIGN_ID,
    "submitted_by": ORGANIZER_ID,
    **VALID_REPORT_BODY,
    "submitted_at": "2026-03-14T10:00:00+00:00",
}


class TestPostImpactReport:
    """POST /campaigns/{id}/impact"""

    def test_submit_report_success(self, client, mock_supabase):
        """Organizer can submit an impact report and earns points + badge check."""
        # Campaign lookup
        campaign_result = MagicMock()
        campaign_result.data = MOCK_CAMPAIGN

        # Insert report
        insert_result = MagicMock()
        insert_result.data = MOCK_REPORT_ROW

        # Points insert
        points_result = MagicMock()
        points_result.data = {"id": "pt-1"}

        # Badge check: total flyers distributed
        flyers_result = MagicMock()
        flyers_result.data = [{"flyers_distributed": 430}]

        # Badge select (not yet awarded)
        badge_select_result = MagicMock()
        badge_select_result.data = []

        # Badge insert
        badge_insert_result = MagicMock()
        badge_insert_result.data = {"id": "badge-1"}

        chain = mock_supabase.table.return_value
        chain.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
        chain.insert.return_value.execute.return_value = insert_result
        chain.select.return_value.eq.return_value.execute.return_value = flyers_result

        # Multiple table() calls: configure side effects
        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "impact_reports":
                mock_table.insert.return_value.execute.return_value = insert_result
                mock_table.select.return_value.eq.return_value.execute.return_value = flyers_result
            elif table_name == "user_points":
                mock_table.insert.return_value.execute.return_value = points_result
            elif table_name == "user_badges":
                mock_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = badge_select_result
                mock_table.insert.return_value.execute.return_value = badge_insert_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/impact", json=VALID_REPORT_BODY)
        assert resp.status_code == 201
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["flyers_distributed"] == 430

    def test_submit_report_campaign_not_found(self, client, mock_supabase):
        """Returns 404 when campaign does not exist."""
        campaign_result = MagicMock()
        campaign_result.data = None

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/impact", json=VALID_REPORT_BODY)
        assert resp.status_code == 404

    def test_submit_report_not_organizer(self, client, mock_supabase):
        """Returns 403 when user is not the campaign organizer."""
        campaign_result = MagicMock()
        campaign_result.data = {**MOCK_CAMPAIGN, "organizer_id": OTHER_USER_ID}

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/impact", json=VALID_REPORT_BODY)
        assert resp.status_code == 403

    def test_submit_report_duplicate(self, client, mock_supabase):
        """Returns 409 when report already exists for campaign."""
        campaign_result = MagicMock()
        campaign_result.data = MOCK_CAMPAIGN

        insert_mock = MagicMock()
        insert_mock.insert.return_value.execute.side_effect = Exception(
            "duplicate key value violates unique constraint"
        )

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "impact_reports":
                mock_table.insert.return_value.execute.side_effect = Exception(
                    "duplicate key value violates unique constraint"
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/impact", json=VALID_REPORT_BODY)
        assert resp.status_code == 409

    def test_submit_report_invalid_body(self, client):
        """Returns 422 for missing required fields."""
        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/impact", json={})
        assert resp.status_code == 422

    def test_submit_report_generic_db_error(self, client, mock_supabase):
        """Returns 500 for a non-duplicate database error (line 66)."""
        campaign_result = MagicMock()
        campaign_result.data = MOCK_CAMPAIGN

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = campaign_result
            elif table_name == "impact_reports":
                mock_table.insert.return_value.execute.side_effect = Exception(
                    "connection timeout"
                )
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.post(f"/campaigns/{CAMPAIGN_ID}/impact", json=VALID_REPORT_BODY)
        assert resp.status_code == 500


class TestGetImpactReport:
    """GET /campaigns/{id}/impact"""

    def test_get_report_success(self, client, mock_supabase):
        """Any authenticated user can retrieve a report."""
        report_result = MagicMock()
        report_result.data = MOCK_REPORT_ROW

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "impact_reports":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = report_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.get(f"/campaigns/{CAMPAIGN_ID}/impact")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["campaign_id"] == CAMPAIGN_ID

    def test_get_report_not_found(self, client, mock_supabase):
        """Returns 404 when no report exists."""
        report_result = MagicMock()
        report_result.data = None

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "impact_reports":
                mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = report_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.get(f"/campaigns/{CAMPAIGN_ID}/impact")
        assert resp.status_code == 404
