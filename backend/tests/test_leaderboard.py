"""Tests for leaderboard & rewards endpoints."""

from unittest.mock import MagicMock


USER_ID = "user-uuid-123"


def _make_points_rows():
    """Generate mock user_points rows summing to 30 pts (20 attend + 10 report)."""
    return [
        {"id": "pt-1", "user_id": USER_ID, "action": "attend", "points": 20, "campaign_id": "c1", "awarded_at": "2026-03-10T10:00:00+00:00"},
        {"id": "pt-2", "user_id": USER_ID, "action": "report", "points": 10, "campaign_id": "c2", "awarded_at": "2026-03-12T10:00:00+00:00"},
    ]


def _make_badge_rows():
    return [
        {"id": "b-1", "user_id": USER_ID, "badge_slug": "impact_100", "awarded_at": "2026-03-12T12:00:00+00:00"},
    ]


def _make_leaderboard_data():
    return [
        {"user_id": USER_ID, "total_points": 240},
        {"user_id": "user-2", "total_points": 180},
    ]


class TestMyPoints:
    """GET /me/points"""

    def test_get_my_points(self, client, mock_supabase):
        pts_rows = _make_points_rows()
        pts_result = MagicMock()
        pts_result.data = pts_rows

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "user_points":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                chain.order.return_value = chain
                chain.execute.return_value = pts_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.get("/me/points")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["total"] == 30  # 20 + 10
        assert len(body["data"]["transactions"]) == 2


class TestMyBadges:
    """GET /me/badges"""

    def test_get_my_badges(self, client, mock_supabase):
        badge_result = MagicMock()
        badge_result.data = _make_badge_rows()

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "user_badges":
                mock_table.select.return_value.eq.return_value.execute.return_value = badge_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.get("/me/badges")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert len(body["data"]) == 1
        assert body["data"][0]["badge_slug"] == "impact_100"


class TestMyLevel:
    """GET /me/level"""

    def test_get_my_level(self, client, mock_supabase):
        pts_result = MagicMock()
        pts_result.data = _make_points_rows()

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "user_points":
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                chain.order.return_value = chain
                chain.execute.return_value = pts_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = client.get("/me/level")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert "level" in body["data"]
        assert "name" in body["data"]
        assert "progress_pct" in body["data"]


class TestLeaderboard:
    """GET /leaderboard"""

    def test_leaderboard_filters_out_user_not_in_filter(self, unauth_client, mock_supabase):
        """_build_leaderboard skips users not in user_ids_filter (line 41 continue branch).
        Triggered via nearby leaderboard where only one user is in the allowed set."""
        campaign_result = MagicMock()
        campaign_result.data = [{"id": "c1", "latitude": 40.71, "longitude": -74.00}]

        signup_result = MagicMock()
        # Only USER_ID signed up for the nearby campaign
        signup_result.data = [{"user_id": USER_ID, "campaign_id": "c1"}]

        pts_result = MagicMock()
        # Points rows include an EXTRA user not in the nearby filter
        pts_result.data = [
            {"user_id": USER_ID, "points": 30},
            {"user_id": "outsider-user", "points": 999},  # should be filtered out
        ]

        users_result = MagicMock()
        users_result.data = [{"id": USER_ID, "name": "Test User"}]

        badges_result = MagicMock()
        badges_result.data = []

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.neq.return_value = chain
                chain.execute.return_value = campaign_result
            elif table_name == "signups":
                mock_table.select.return_value.in_.return_value.execute.return_value = signup_result
            elif table_name == "user_points":
                chain = mock_table.select.return_value
                chain.gte.return_value = chain
                chain.execute.return_value = pts_result
            elif table_name == "users":
                mock_table.select.return_value.in_.return_value.execute.return_value = users_result
            elif table_name == "user_badges":
                mock_table.select.return_value.in_.return_value.execute.return_value = badges_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = unauth_client.get("/leaderboard/nearby?lat=40.71&lng=-74.00&radius_km=10")
        assert resp.status_code == 200
        body = resp.json()
        # outsider-user should be excluded despite having more points
        user_ids_in_result = [entry["user"]["id"] for entry in body["data"]]
        assert "outsider-user" not in user_ids_in_result
        assert USER_ID in user_ids_in_result

    def test_leaderboard_global_all_time(self, unauth_client, mock_supabase):
        pts_result = MagicMock()
        pts_result.data = [
            {"user_id": USER_ID, "points": 20},
            {"user_id": USER_ID, "points": 10},
            {"user_id": "user-2", "points": 50},
        ]

        users_result = MagicMock()
        users_result.data = [
            {"id": USER_ID, "name": "Test User"},
            {"id": "user-2", "name": "Jane"},
        ]

        badges_result = MagicMock()
        badges_result.data = [
            {"user_id": USER_ID, "badge_slug": "impact_100"},
        ]

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "user_points":
                chain = mock_table.select.return_value
                chain.gte.return_value = chain
                chain.execute.return_value = pts_result
            elif table_name == "users":
                mock_table.select.return_value.in_.return_value.execute.return_value = users_result
            elif table_name == "user_badges":
                mock_table.select.return_value.in_.return_value.execute.return_value = badges_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = unauth_client.get("/leaderboard?scope=global&period=all_time")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)
        # user-2 has 50 pts, should rank first
        assert body["data"][0]["user"]["id"] == "user-2"
        assert body["data"][0]["rank"] == 1

    def test_leaderboard_monthly(self, unauth_client, mock_supabase):
        pts_result = MagicMock()
        pts_result.data = []

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "user_points":
                chain = mock_table.select.return_value
                chain.gte.return_value = chain
                chain.execute.return_value = pts_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = unauth_client.get("/leaderboard?period=monthly")
        assert resp.status_code == 200

    def test_leaderboard_weekly(self, unauth_client, mock_supabase):
        pts_result = MagicMock()
        pts_result.data = []

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "user_points":
                chain = mock_table.select.return_value
                chain.gte.return_value = chain
                chain.execute.return_value = pts_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = unauth_client.get("/leaderboard?period=weekly")
        assert resp.status_code == 200


class TestLeaderboardNearby:
    """GET /leaderboard/nearby"""

    def test_nearby_requires_params(self, unauth_client, mock_supabase):
        resp = unauth_client.get("/leaderboard/nearby")
        assert resp.status_code == 422

    def test_nearby_no_campaigns_in_radius(self, unauth_client, mock_supabase):
        """Returns empty list when no campaigns are within radius (line 114)."""
        campaign_result = MagicMock()
        # Campaign far away — will not pass haversine filter
        campaign_result.data = [
            {"id": "c-far", "latitude": 90.0, "longitude": 0.0},
        ]

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.neq.return_value = chain
                chain.execute.return_value = campaign_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = unauth_client.get("/leaderboard/nearby?lat=40.71&lng=-74.00&radius_km=1")
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    def test_nearby_campaigns_but_no_signups(self, unauth_client, mock_supabase):
        """Returns empty list when nearby campaigns have no signups (line 126)."""
        campaign_result = MagicMock()
        campaign_result.data = [{"id": "c1", "latitude": 40.71, "longitude": -74.00}]

        signup_result = MagicMock()
        signup_result.data = []  # no signups

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.neq.return_value = chain
                chain.execute.return_value = campaign_result
            elif table_name == "signups":
                mock_table.select.return_value.in_.return_value.execute.return_value = signup_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = unauth_client.get("/leaderboard/nearby?lat=40.71&lng=-74.00&radius_km=10")
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    def test_nearby_returns_leaderboard(self, unauth_client, mock_supabase):
        campaign_result = MagicMock()
        campaign_result.data = [
            {"id": "c1", "latitude": 40.71, "longitude": -74.00},
        ]

        signup_result = MagicMock()
        signup_result.data = [
            {"user_id": USER_ID, "campaign_id": "c1"},
        ]

        pts_result = MagicMock()
        pts_result.data = [
            {"user_id": USER_ID, "points": 30},
        ]

        users_result = MagicMock()
        users_result.data = [
            {"id": USER_ID, "name": "Test User"},
        ]

        badges_result = MagicMock()
        badges_result.data = []

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                chain = mock_table.select.return_value
                chain.neq.return_value = chain
                chain.neq.return_value = chain
                chain.execute.return_value = campaign_result
            elif table_name == "signups":
                mock_table.select.return_value.in_.return_value.execute.return_value = signup_result
            elif table_name == "user_points":
                chain = mock_table.select.return_value
                chain.gte.return_value = chain
                chain.execute.return_value = pts_result
            elif table_name == "users":
                mock_table.select.return_value.in_.return_value.execute.return_value = users_result
            elif table_name == "user_badges":
                mock_table.select.return_value.in_.return_value.execute.return_value = badges_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = unauth_client.get("/leaderboard/nearby?lat=40.71&lng=-74.00&radius_km=10")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
