"""Tests for flyer generation utilities."""

import importlib
from pathlib import Path

import pytest

TEST_OUTPUT_DIR = Path("output_images")


def _sample_payload() -> dict[str, str]:
    return {
        "title": "Chelsea Pantry Drive",
        "location": "Chelsea Community Center",
        "address": "123 W 26th St, New York, NY",
        "date": "2026-03-22",
        "start_time": "10:00 AM",
        "end_time": "2:00 PM",
        "description": "Join us & support neighbors",
    }


def test_generate_flyer_pdf_writes_pdf():
    flyer_module = importlib.import_module("services.flyer_generator")
    campaign = flyer_module.FlyerCampaignData.from_dict(_sample_payload())
    TEST_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = TEST_OUTPUT_DIR / "test_flyer_dark.pdf"

    result_path = flyer_module.generate_flyer_pdf(campaign, output)

    assert result_path.exists()
    assert result_path.read_bytes().startswith(b"%PDF")


def test_generate_flyer_pdf_color_blocked_style():
    flyer_module = importlib.import_module("services.flyer_generator")
    campaign = flyer_module.FlyerCampaignData.from_dict(_sample_payload())
    TEST_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = TEST_OUTPUT_DIR / "test_flyer_color_blocked.pdf"

    result_path = flyer_module.generate_flyer_pdf(
        campaign, output, style="color_blocked"
    )

    assert result_path.exists()
    assert result_path.read_bytes().startswith(b"%PDF")


def test_generate_flyer_pdf_modern_bordered_style():
    flyer_module = importlib.import_module("services.flyer_generator")
    campaign = flyer_module.FlyerCampaignData.from_dict(_sample_payload())
    TEST_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = TEST_OUTPUT_DIR / "test_flyer_modern_bordered.pdf"

    result_path = flyer_module.generate_flyer_pdf(
        campaign, output, style="modern_bordered"
    )

    assert result_path.exists()
    assert result_path.read_bytes().startswith(b"%PDF")


def test_generate_flyer_pdf_invalid_style_raises():
    flyer_module = importlib.import_module("services.flyer_generator")
    campaign = flyer_module.FlyerCampaignData.from_dict(_sample_payload())
    TEST_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = TEST_OUTPUT_DIR / "test_flyer_invalid_style.pdf"

    with pytest.raises(ValueError, match="Unsupported poster style"):
        flyer_module.generate_flyer_pdf(campaign, output, style="unknown_style")


def test_from_dict_requires_core_fields():
    flyer_module = importlib.import_module("services.flyer_generator")
    with pytest.raises(ValueError, match="Missing required campaign fields"):
        flyer_module.FlyerCampaignData.from_dict({"title": "Only title"})


def test_fetch_campaign_from_supabase_returns_row(monkeypatch):
    script_module = importlib.import_module("scripts.generate_flyer")

    class _FakeExecute:
        data = [
            {
                "title": "A",
                "location": "B",
                "address": "C",
                "date": "D",
                "start_time": "E",
                "end_time": "F",
            }
        ]

    class _FakeTable:
        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            return _FakeExecute()

    class _FakeClient:
        def table(self, *_args, **_kwargs):
            return _FakeTable()

    monkeypatch.setattr(
        "scripts.generate_flyer._build_supabase_client", lambda: _FakeClient()
    )
    row = script_module.fetch_campaign_from_supabase("campaign-id")
    assert row["title"] == "A"
