"""Shared test fixtures for all backend tests."""

import sys
import os
from unittest.mock import MagicMock, patch

import pytest

# Patch supabase_client module before it gets imported by main
# This prevents the real create_client from being called (which needs env vars)
sys.modules["supabase_client"] = MagicMock()

from starlette.testclient import TestClient


@pytest.fixture()
def mock_supabase():
    """Return a fresh MagicMock representing the Supabase client."""
    return MagicMock()


@pytest.fixture()
def mock_user():
    """Return a mock user object matching Supabase UserResponse shape."""
    user_inner = MagicMock()
    user_inner.id = "user-uuid-123"
    user_inner.user_metadata = {"name": "Test User"}

    user_response = MagicMock()
    user_response.user = user_inner
    return user_response


@pytest.fixture()
def client(mock_supabase, mock_user):
    """Create a TestClient with dependency overrides for auth and supabase."""
    # Import inside fixture so patched module is used
    from main import app
    from auth import get_current_user
    from supabase_client import get_supabase_client

    async def _override_current_user():
        return mock_user

    def _override_supabase():
        return mock_supabase

    app.dependency_overrides[get_current_user] = _override_current_user
    app.dependency_overrides[get_supabase_client] = _override_supabase

    with TestClient(app) as tc:
        yield tc

    app.dependency_overrides.clear()


@pytest.fixture()
def unauth_client(mock_supabase):
    """TestClient without auth override -- for public endpoints."""
    from main import app
    from supabase_client import get_supabase_client

    def _override_supabase():
        return mock_supabase

    app.dependency_overrides[get_supabase_client] = _override_supabase

    with TestClient(app) as tc:
        yield tc

    app.dependency_overrides.clear()
