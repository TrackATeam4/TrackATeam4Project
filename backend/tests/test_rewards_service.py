"""Unit tests for services/rewards.py -- scoring, levels, haversine."""

from datetime import date, timedelta, datetime, timezone

import pytest


class TestGetLevel:
    def test_zero_points(self):
        from services.rewards import get_level

        result = get_level(0)
        assert result["level"] == 1
        assert result["name"] == "Seedling"

    def test_seedling_progress(self):
        from services.rewards import get_level

        result = get_level(25)
        assert result["level"] == 1
        assert result["progress_pct"] == 50

    def test_sprout(self):
        from services.rewards import get_level

        result = get_level(50)
        assert result["level"] == 2
        assert result["name"] == "Sprout"

    def test_bloom(self):
        from services.rewards import get_level

        result = get_level(150)
        assert result["level"] == 3
        assert result["name"] == "Bloom"

    def test_branch(self):
        from services.rewards import get_level

        result = get_level(350)
        assert result["level"] == 4
        assert result["name"] == "Branch"

    def test_champion(self):
        from services.rewards import get_level

        result = get_level(700)
        assert result["level"] == 5
        assert result["name"] == "Lemontree Champion"
        assert result["progress_pct"] == 100

    def test_above_champion(self):
        from services.rewards import get_level

        result = get_level(9999)
        assert result["level"] == 5
        assert result["progress_pct"] == 100


class TestHaversine:
    def test_same_point(self):
        from services.rewards import haversine_km

        assert haversine_km(40.0, -74.0, 40.0, -74.0) == 0.0

    def test_known_distance(self):
        from services.rewards import haversine_km

        # NYC to Newark is roughly 14-16 km
        dist = haversine_km(40.7128, -74.0060, 40.7357, -74.1724)
        assert 10 < dist < 20

    def test_antipodal_points(self):
        from services.rewards import haversine_km

        # Max distance is roughly half the earth circumference
        dist = haversine_km(0, 0, 0, 180)
        assert 20000 < dist < 20100


class TestScoreCampaign:
    def _make_campaign(self, **overrides):
        base = {
            "id": "c1",
            "date": (date.today() + timedelta(days=2)).isoformat(),
            "latitude": 40.71,
            "longitude": -74.00,
            "tags": ["community"],
            "max_volunteers": 10,
            "signup_count": 5,
            "promoted_at": None,
            "promoted_until": None,
        }
        return {**base, **overrides}

    def test_score_is_between_0_and_1(self):
        from services.rewards import score_campaign

        campaign = self._make_campaign()
        s = score_campaign(campaign, 40.71, -74.00, ["community"], set())
        assert 0.0 <= s <= 1.0

    def test_proximity_high_when_close(self):
        from services.rewards import score_campaign

        campaign = self._make_campaign()
        close = score_campaign(campaign, 40.71, -74.00, [], set())
        far = score_campaign(campaign, 50.0, -80.0, [], set())
        assert close > far

    def test_novelty_bonus_for_unseen(self):
        from services.rewards import score_campaign

        campaign = self._make_campaign()
        unseen = score_campaign(campaign, None, None, [], set())
        seen = score_campaign(campaign, None, None, [], {"c1"})
        assert unseen > seen

    def test_promotion_boost(self):
        from services.rewards import score_campaign

        promoted_until = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
        promoted = self._make_campaign(promoted_until=promoted_until)
        not_promoted = self._make_campaign()
        s_promoted = score_campaign(promoted, None, None, [], set())
        s_normal = score_campaign(not_promoted, None, None, [], set())
        assert s_promoted > s_normal

    def test_past_event_zero_urgency(self):
        from services.rewards import score_campaign

        past = self._make_campaign(date=(date.today() - timedelta(days=1)).isoformat())
        future = self._make_campaign(date=(date.today() + timedelta(days=1)).isoformat())
        s_past = score_campaign(past, None, None, [], set())
        s_future = score_campaign(future, None, None, [], set())
        assert s_future > s_past

    def test_interest_match(self):
        from services.rewards import score_campaign

        campaign = self._make_campaign(tags=["food", "community"])
        with_match = score_campaign(campaign, None, None, ["food"], set())
        without = score_campaign(campaign, None, None, ["sports"], set())
        assert with_match > without

    def test_urgency_decays_beyond_3_days(self):
        """Urgency uses decay formula for events 4-14 days away (line 87)."""
        from services.rewards import score_campaign

        campaign_4d = self._make_campaign(date=(date.today() + timedelta(days=4)).isoformat())
        campaign_2d = self._make_campaign(date=(date.today() + timedelta(days=2)).isoformat())
        s_4d = score_campaign(campaign_4d, None, None, [], set())
        s_2d = score_campaign(campaign_2d, None, None, [], set())
        # Event in 2 days (peak urgency) should score higher than 4 days
        assert s_2d > s_4d

    def test_social_proof_no_max_volunteers(self):
        """Uses fill_rate=0.5 when max_volunteers is None (line 95)."""
        from services.rewards import score_campaign

        campaign_no_cap = self._make_campaign(max_volunteers=None)
        campaign_with_cap = self._make_campaign(max_volunteers=10, signup_count=10)
        # Both should produce a valid float score
        s_no_cap = score_campaign(campaign_no_cap, None, None, [], set())
        s_full = score_campaign(campaign_with_cap, None, None, [], set())
        assert isinstance(s_no_cap, float)
        assert isinstance(s_full, float)
        # Full campaign (fill_rate=1.0) should outscore no-cap (fill_rate=0.5)
        assert s_full > s_no_cap

    def test_promoted_until_as_datetime_object(self):
        """Handles promoted_until as a datetime object, not a string (line 108)."""
        from services.rewards import score_campaign

        # Pass a real datetime object (not a string)
        promoted_until_dt = datetime.now(timezone.utc) + timedelta(hours=6)
        campaign = self._make_campaign(promoted_until=promoted_until_dt)
        score = score_campaign(campaign, None, None, [], set())
        assert score > 0  # boost should be applied without error
