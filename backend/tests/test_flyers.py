"""Tests for flyers router endpoints."""

from unittest.mock import MagicMock


def test_list_flyer_templates_returns_only_pdfs_sorted(unauth_client, mock_supabase):
    bucket = MagicMock()
    bucket.list.return_value = [
        {"name": "template-c.pdf", "updated_at": "2026-03-12T10:00:00Z"},
        {"name": "ignore-me.png", "updated_at": "2026-03-11T10:00:00Z"},
        {"name": "Template-a.PDF", "updated_at": "2026-03-10T10:00:00Z"},
        {"name": "  "},
    ]
    bucket.get_public_url.side_effect = lambda path: f"https://cdn.example.com/{path}"
    mock_supabase.storage.from_.return_value = bucket

    resp = unauth_client.get("/flyers/templates")

    assert resp.status_code == 200
    body = resp.json()
    assert [item["name"] for item in body["templates"]] == [
        "Template-a.PDF",
        "template-c.pdf",
    ]
    assert body["templates"][0]["url"] == "https://cdn.example.com/Template-a.PDF"


def test_list_flyer_templates_returns_empty_list(unauth_client, mock_supabase):
    bucket = MagicMock()
    bucket.list.return_value = []
    mock_supabase.storage.from_.return_value = bucket

    resp = unauth_client.get("/flyers/templates")

    assert resp.status_code == 200
    assert resp.json() == {"templates": []}


def test_list_flyer_templates_storage_error_returns_500(unauth_client, mock_supabase):
    bucket = MagicMock()
    bucket.list.side_effect = RuntimeError("storage unavailable")
    mock_supabase.storage.from_.return_value = bucket

    resp = unauth_client.get("/flyers/templates")

    assert resp.status_code == 500
    assert resp.json()["error"] == "Failed to fetch flyer templates"

