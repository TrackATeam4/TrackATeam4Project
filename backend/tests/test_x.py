"""Tests for POST /x/post endpoint."""

from unittest.mock import MagicMock, patch


class TestCreateXPost:
    """POST /x/post"""

    def _mock_x_client(self, tweet_id="1234567890"):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.data = {"id": tweet_id}
        mock_client.create_tweet.return_value = mock_response
        return mock_client

    def test_post_success(self, client):
        """Returns tweet id and URL on success."""
        tweet_id = "9876543210"
        mock_x = self._mock_x_client(tweet_id)

        with patch("routers.x.get_x_client", return_value=mock_x):
            resp = client.post("/x/post", json={"text": "Hello from TrackA!"})

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["tweet_id"] == tweet_id
        assert tweet_id in body["data"]["url"]
        assert body["data"]["text"] == "Hello from TrackA!"

    def test_post_uses_user_auth(self, client):
        """create_tweet must be called with user_auth=True to use OAuth 1.0a."""
        mock_x = self._mock_x_client()

        with patch("routers.x.get_x_client", return_value=mock_x):
            client.post("/x/post", json={"text": "OAuth check"})

        mock_x.create_tweet.assert_called_once_with(
            text="OAuth check", user_auth=True
        )

    def test_post_empty_text_rejected(self, client):
        """Empty string is rejected with 422 before hitting Twitter."""
        resp = client.post("/x/post", json={"text": ""})
        assert resp.status_code == 422

    def test_post_text_too_long_rejected(self, client):
        """Text over 280 characters is rejected with 422."""
        resp = client.post("/x/post", json={"text": "x" * 281})
        assert resp.status_code == 422

    def test_post_requires_auth(self):
        """Endpoint requires a valid auth token (401 without one)."""
        from main import app
        from starlette.testclient import TestClient

        # Use a plain client with no auth override
        with TestClient(app, raise_server_exceptions=False) as tc:
            resp = tc.post("/x/post", json={"text": "no auth"})
        assert resp.status_code == 401

    def test_post_upstream_failure_returns_502(self, client):
        """Tweepy exceptions are converted to 502, not leaked to the caller."""
        mock_x = MagicMock()
        mock_x.create_tweet.side_effect = Exception("Twitter is down")

        with patch("routers.x.get_x_client", return_value=mock_x):
            resp = client.post("/x/post", json={"text": "will fail"})

        assert resp.status_code == 502
        # Internal exception message must not be in the response body
        assert "Twitter is down" not in resp.text
