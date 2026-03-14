"""Tests for feed & discovery endpoints."""

from datetime import date, datetime, timezone, timedelta
from unittest.mock import MagicMock


FUTURE_DATE = (date.today() + timedelta(days=2)).isoformat()
PAST_DATE = (date.today() - timedelta(days=5)).isoformat()

MOCK_CAMPAIGNS = [
    {
        "id": "camp-1",
        "organizer_id": "org-1",
        "title": "Park Flyering",
        "description": "Distribute flyers at the park",
        "date": FUTURE_DATE,
        "status": "published",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "tags": ["environment", "community"],
        "max_volunteers": 10,
        "signup_count": 5,
        "promoted_at": None,
        "promoted_until": None,
    },
    {
        "id": "camp-2",
        "organizer_id": "org-2",
        "title": "Downtown Outreach",
        "description": "Reaching downtown families",
        "date": FUTURE_DATE,
        "status": "published",
        "latitude": 40.7580,
        "longitude": -73.9855,
        "tags": ["food", "community"],
        "max_volunteers": 20,
        "signup_count": 18,
        "promoted_at": None,
        "promoted_until": None,
    },
]


def _setup_campaign_query(mock_supabase, campaigns):
    """Helper to set up the supabase mock for campaign queries."""
    result = MagicMock()
    result.data = campaigns
    result.count = len(campaigns)

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "campaigns":
            # Support chained .select().eq().gte().lte().ilike().execute()
            chain = mock_table.select.return_value
            chain.eq.return_value = chain
            chain.gte.return_value = chain
            chain.lte.return_value = chain
            chain.ilike.return_value = chain
            chain.contains.return_value = chain
            chain.neq.return_value = chain
            chain.order.return_value = chain
            chain.range.return_value = chain
            chain.limit.return_value = chain
            chain.execute.return_value = result
        elif table_name == "signups":
            signup_result = MagicMock()
            signup_result.data = []
            signup_result.count = 0
            signup_chain = mock_table.select.return_value
            signup_chain.eq.return_value = signup_chain
            signup_chain.gte.return_value = signup_chain
            signup_chain.in_.return_value = signup_chain
            signup_chain.execute.return_value = signup_result
        elif table_name == "user_points":
            pts_result = MagicMock()
            pts_result.data = []
            pts_chain = mock_table.select.return_value
            pts_chain.eq.return_value = pts_chain
            pts_chain.execute.return_value = pts_result
        return mock_table

    mock_supabase.table.side_effect = table_router


class TestFeed:
    """GET /feed -- personalized ranked events."""

    def test_feed_returns_ranked_campaigns(self, client, mock_supabase):
        _setup_campaign_query(mock_supabase, MOCK_CAMPAIGNS)

        resp = client.get("/feed?lat=40.71&lng=-74.00")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)

    def test_feed_pagination(self, client, mock_supabase):
        _setup_campaign_query(mock_supabase, MOCK_CAMPAIGNS)

        resp = client.get("/feed?page=1&limit=1")
        assert resp.status_code == 200
        body = resp.json()
        assert "meta" in body

    def test_feed_without_location(self, client, mock_supabase):
        _setup_campaign_query(mock_supabase, MOCK_CAMPAIGNS)

        resp = client.get("/feed")
        assert resp.status_code == 200


class TestFeedTrending:
    """GET /feed/trending -- public trending events."""

    def test_trending_returns_list(self, unauth_client, mock_supabase):
        _setup_campaign_query(mock_supabase, MOCK_CAMPAIGNS)

        resp = unauth_client.get("/feed/trending")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)

    def test_trending_empty_when_no_campaigns(self, unauth_client, mock_supabase):
        """Returns empty list when there are no published campaigns (line 77)."""
        _setup_campaign_query(mock_supabase, [])

        resp = unauth_client.get("/feed/trending")
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    def test_trending_tallies_signups(self, unauth_client, mock_supabase):
        """Signup tally loop runs when recent signups exist (lines 95-96)."""
        signup_result = MagicMock()
        signup_result.data = [
            {"campaign_id": "camp-1"},
            {"campaign_id": "camp-1"},
            {"campaign_id": "camp-2"},
        ]

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "campaigns":
                result = MagicMock()
                result.data = MOCK_CAMPAIGNS
                chain = mock_table.select.return_value
                chain.eq.return_value = chain
                chain.execute.return_value = result
            elif table_name == "signups":
                signup_chain = mock_table.select.return_value
                signup_chain.in_.return_value = signup_chain
                signup_chain.gte.return_value = signup_chain
                signup_chain.execute.return_value = signup_result
            return mock_table

        mock_supabase.table.side_effect = table_router

        resp = unauth_client.get("/feed/trending")
        assert resp.status_code == 200
        body = resp.json()
        # camp-1 has 2 recent signups, should rank first
        assert body["data"][0]["id"] == "camp-1"


class TestFeedNearby:
    """GET /feed/nearby -- public nearby events."""

    def test_nearby_requires_lat_lng(self, unauth_client, mock_supabase):
        _setup_campaign_query(mock_supabase, [])

        resp = unauth_client.get("/feed/nearby")
        assert resp.status_code == 422

    def test_nearby_returns_filtered(self, unauth_client, mock_supabase):
        _setup_campaign_query(mock_supabase, MOCK_CAMPAIGNS)

        resp = unauth_client.get("/feed/nearby?lat=40.71&lng=-74.00&radius_km=10")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True


class TestSearch:
    """GET /campaigns/search -- public search."""

    def test_search_by_query(self, unauth_client, mock_supabase):
        _setup_campaign_query(mock_supabase, MOCK_CAMPAIGNS[:1])

        resp = unauth_client.get("/campaigns/search?q=park")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

    def test_search_by_tags(self, unauth_client, mock_supabase):
        _setup_campaign_query(mock_supabase, MOCK_CAMPAIGNS)

        resp = unauth_client.get("/campaigns/search?tags=environment,community")
        assert resp.status_code == 200

    def test_search_by_date_range(self, unauth_client, mock_supabase):
        _setup_campaign_query(mock_supabase, MOCK_CAMPAIGNS)

        resp = unauth_client.get(
            f"/campaigns/search?date_from={FUTURE_DATE}&date_to={FUTURE_DATE}"
        )
        assert resp.status_code == 200

    def test_search_empty_returns_empty_list(self, unauth_client, mock_supabase):
        _setup_campaign_query(mock_supabase, [])

        resp = unauth_client.get("/campaigns/search?q=nonexistent")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"] == []
