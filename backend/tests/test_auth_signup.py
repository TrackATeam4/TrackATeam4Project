"""Tests for POST /auth/signup profile synchronization behavior."""

from types import SimpleNamespace


def _mock_signup_response(user):
    return SimpleNamespace(user=user)


def test_signup_creates_auth_user_and_public_profile(client, mock_supabase):
    auth_user = SimpleNamespace(
        id="user-123",
        email="new.user@example.com",
        user_metadata={"name": "New User"},
    )
    mock_supabase.auth.sign_up.return_value = _mock_signup_response(auth_user)

    response = client.post(
        "/auth/signup",
        json={"email": "new.user@example.com", "password": "longpassword"},
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Sign up successful"

    mock_supabase.auth.sign_up.assert_called_once_with(
        {"email": "new.user@example.com", "password": "longpassword"}
    )
    mock_supabase.table.assert_called_once_with("users")
    mock_supabase.table.return_value.upsert.assert_called_once_with(
        {
            "id": "user-123",
            "email": "new.user@example.com",
            "name": "New User",
            "role": "volunteer",
        },
        on_conflict="id",
    )


def test_signup_uses_email_prefix_when_name_missing(client, mock_supabase):
    auth_user = SimpleNamespace(
        id="user-456",
        email="fallback.name@example.com",
        user_metadata=None,
    )
    mock_supabase.auth.sign_up.return_value = _mock_signup_response(auth_user)

    response = client.post(
        "/auth/signup",
        json={"email": "fallback.name@example.com", "password": "longpassword"},
    )

    assert response.status_code == 200
    mock_supabase.table.return_value.upsert.assert_called_once_with(
        {
            "id": "user-456",
            "email": "fallback.name@example.com",
            "name": "fallback.name",
            "role": "volunteer",
        },
        on_conflict="id",
    )


def test_signup_returns_500_when_auth_user_id_missing(client, mock_supabase):
    auth_user = SimpleNamespace(email="missing.id@example.com", user_metadata={})
    mock_supabase.auth.sign_up.return_value = _mock_signup_response(auth_user)

    response = client.post(
        "/auth/signup",
        json={"email": "missing.id@example.com", "password": "longpassword"},
    )

    assert response.status_code == 500
    assert "failed to initialize profile" in response.json()["detail"].lower()
    mock_supabase.table.assert_not_called()


def test_signup_returns_500_when_profile_upsert_fails(client, mock_supabase):
    auth_user = SimpleNamespace(
        id="user-789",
        email="upsert.fail@example.com",
        user_metadata={"name": "Upsert Fail"},
    )
    mock_supabase.auth.sign_up.return_value = _mock_signup_response(auth_user)
    mock_supabase.table.return_value.upsert.side_effect = Exception("db write failed")

    response = client.post(
        "/auth/signup",
        json={"email": "upsert.fail@example.com", "password": "longpassword"},
    )

    assert response.status_code == 500
    assert "failed to initialize profile" in response.json()["detail"].lower()


def test_signup_rejects_short_password(client):
    response = client.post(
        "/auth/signup",
        json={"email": "tiny.pass@example.com", "password": "short"},
    )

    assert response.status_code == 422

