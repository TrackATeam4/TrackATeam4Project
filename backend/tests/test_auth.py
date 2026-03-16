"""Unit tests for authentication endpoints in main.py."""

from unittest.mock import MagicMock


def _setup_auth_mock(mock_supabase, response_type, **kwargs):
    """Helper to configure auth mocks based on response type."""
    if response_type == "signup_success":
        user_obj = MagicMock()
        user_obj.id = kwargs.get("user_id", "new-user-123")
        user_obj.email = kwargs.get("email", "newuser@example.com")
        
        response = MagicMock()
        response.user = user_obj
        mock_supabase.auth.sign_up.return_value = response
        
    elif response_type == "signup_error":
        mock_supabase.auth.sign_up.side_effect = Exception(kwargs.get("error", "User already exists"))
        
    elif response_type == "signin_success":
        user_obj = MagicMock()
        user_obj.id = kwargs.get("user_id", "user-123")
        user_obj.email = kwargs.get("email", "user@example.com")
        
        session_obj = MagicMock()
        session_obj.access_token = kwargs.get("token", "jwt-token-abc")
        session_obj.refresh_token = "refresh-token-xyz"
        
        response = MagicMock()
        response.user = user_obj
        response.session = session_obj
        mock_supabase.auth.sign_in_with_password.return_value = response
        
    elif response_type == "signin_error":
        mock_supabase.auth.sign_in_with_password.side_effect = Exception(kwargs.get("error", "Invalid credentials"))
        
    elif response_type == "reset_success":
        mock_supabase.auth.reset_password_for_email.return_value = None
        
    elif response_type == "reset_error":
        mock_supabase.auth.reset_password_for_email.side_effect = Exception(kwargs.get("error", "Email service unavailable"))


class TestSignUp:
    """POST /auth/signup"""

    def test_signup_success(self, unauth_client, mock_supabase):
        """Successful user registration returns user data."""
        _setup_auth_mock(mock_supabase, "signup_success")
        
        payload = {
            "email": "newuser@example.com",
            "password": "securepass123"
        }
        
        resp = unauth_client.post("/auth/signup", json=payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["message"] == "Sign up successful"
        assert "user" in body

    def test_signup_invalid_email(self, unauth_client, mock_supabase):
        """Invalid email format returns 422 validation error."""
        payload = {
            "email": "not-an-email",
            "password": "securepass123"
        }
        
        resp = unauth_client.post("/auth/signup", json=payload)
        assert resp.status_code == 422

    def test_signup_short_password(self, unauth_client, mock_supabase):
        """Password shorter than 8 characters returns 422 validation error."""
        payload = {
            "email": "user@example.com",
            "password": "short"
        }
        
        resp = unauth_client.post("/auth/signup", json=payload)
        assert resp.status_code == 422

    def test_signup_missing_email(self, unauth_client, mock_supabase):
        """Missing email field returns 422 validation error."""
        payload = {
            "password": "securepass123"
        }
        
        resp = unauth_client.post("/auth/signup", json=payload)
        assert resp.status_code == 422

    def test_signup_missing_password(self, unauth_client, mock_supabase):
        """Missing password field returns 422 validation error."""
        payload = {
            "email": "user@example.com"
        }
        
        resp = unauth_client.post("/auth/signup", json=payload)
        assert resp.status_code == 422

    def test_signup_empty_body(self, unauth_client, mock_supabase):
        """Empty request body returns 422 validation error."""
        resp = unauth_client.post("/auth/signup", json={})
        assert resp.status_code == 422


class TestSignIn:
    """POST /auth/signin"""

    def test_signin_success(self, unauth_client, mock_supabase):
        """Successful sign in returns session and user data."""
        _setup_auth_mock(mock_supabase, "signin_success")
        
        payload = {
            "email": "user@example.com",
            "password": "correctpassword"
        }
        
        resp = unauth_client.post("/auth/signin", json=payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["message"] == "Sign in successful"
        assert "user" in body
        assert "session" in body

    def test_signin_invalid_email_format(self, unauth_client, mock_supabase):
        """Invalid email format returns 422 validation error."""
        payload = {
            "email": "not-an-email",
            "password": "somepassword"
        }
        
        resp = unauth_client.post("/auth/signin", json=payload)
        assert resp.status_code == 422

    def test_signin_missing_email(self, unauth_client, mock_supabase):
        """Missing email field returns 422 validation error."""
        payload = {
            "password": "somepassword"
        }
        
        resp = unauth_client.post("/auth/signin", json=payload)
        assert resp.status_code == 422

    def test_signin_missing_password(self, unauth_client, mock_supabase):
        """Missing password field returns 422 validation error."""
        payload = {
            "email": "user@example.com"
        }
        
        resp = unauth_client.post("/auth/signin", json=payload)
        assert resp.status_code == 422

    def test_signin_empty_body(self, unauth_client, mock_supabase):
        """Empty request body returns 422 validation error."""
        resp = unauth_client.post("/auth/signin", json={})
        assert resp.status_code == 422


class TestResetPassword:
    """POST /auth/reset-password"""

    def test_reset_password_success(self, unauth_client, mock_supabase):
        """Successful password reset request returns success message."""
        _setup_auth_mock(mock_supabase, "reset_success")
        
        payload = {
            "email": "user@example.com"
        }
        
        resp = unauth_client.post("/auth/reset-password", json=payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["message"] == "Password reset email sent"

    def test_reset_password_invalid_email_format(self, unauth_client, mock_supabase):
        """Invalid email format returns 422 validation error."""
        payload = {
            "email": "not-an-email"
        }
        
        resp = unauth_client.post("/auth/reset-password", json=payload)
        assert resp.status_code == 422

    def test_reset_password_missing_email(self, unauth_client, mock_supabase):
        """Missing email field returns 422 validation error."""
        resp = unauth_client.post("/auth/reset-password", json={})
        assert resp.status_code == 422

    def test_reset_password_nonexistent_email(self, unauth_client, mock_supabase):
        """Reset for non-existent email still returns success (security best practice)."""
        _setup_auth_mock(mock_supabase, "reset_success")
        
        payload = {
            "email": "nonexistent@example.com"
        }
        
        resp = unauth_client.post("/auth/reset-password", json=payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["message"] == "Password reset email sent"


class TestGetMe:
    """GET /auth/me"""

    def test_get_me_success(self, client, mock_user):
        """Authenticated user can retrieve their profile."""
        resp = client.get("/auth/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert "data" in body

    def test_get_me_no_auth_header(self, unauth_client, mock_supabase):
        """Request without authorization header returns 401."""
        resp = unauth_client.get("/auth/me")
        assert resp.status_code == 401

    def test_get_me_invalid_token_format(self, unauth_client, mock_supabase):
        """Invalid token format returns 401."""
        headers = {"Authorization": "InvalidFormat token123"}
        resp = unauth_client.get("/auth/me", headers=headers)
        assert resp.status_code == 401

    def test_get_me_missing_bearer_prefix(self, unauth_client, mock_supabase):
        """Token without Bearer prefix returns 401."""
        headers = {"Authorization": "token123"}
        resp = unauth_client.get("/auth/me", headers=headers)
        assert resp.status_code == 401

    def test_get_me_empty_token(self, unauth_client, mock_supabase):
        """Empty token after Bearer returns 401."""
        headers = {"Authorization": "Bearer "}
        resp = unauth_client.get("/auth/me", headers=headers)
        assert resp.status_code == 401
