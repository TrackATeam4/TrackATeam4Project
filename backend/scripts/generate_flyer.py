"""CLI utility to generate a campaign flyer PDF from args or Supabase."""

from __future__ import annotations

import argparse
import importlib
import os
from pathlib import Path

_flyer_module = importlib.import_module("services.flyer_generator")
FlyerCampaignData = _flyer_module.FlyerCampaignData
generate_flyer_pdf = _flyer_module.generate_flyer_pdf

CAMPAIGN_SELECT_FIELDS = "title,location,address,date,start_time,end_time,description"


def _build_supabase_client():
    from supabase import create_client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise ValueError(
            "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
            "(or SUPABASE_ANON_KEY)."
        )
    return create_client(url, key)


def fetch_campaign_from_supabase(campaign_id: str) -> dict[str, object]:
    client = _build_supabase_client()
    response = (
        client.table("campaigns")
        .select(CAMPAIGN_SELECT_FIELDS)
        .eq("id", campaign_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise ValueError(f"Campaign not found: {campaign_id}")
    return rows[0]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a campaign flyer PDF.")
    parser.add_argument("--campaign-id", help="Campaign UUID to fetch from Supabase")
    parser.add_argument("--title")
    parser.add_argument("--location")
    parser.add_argument("--address")
    parser.add_argument("--date")
    parser.add_argument("--start-time")
    parser.add_argument("--end-time")
    parser.add_argument("--description")
    parser.add_argument(
        "--output",
        default="output_images/campaign_flyer.pdf",
        help="Output PDF path",
    )
    parser.add_argument(
        "--style",
        default="dark_centered",
        choices=["dark_centered", "color_blocked"],
        help="Poster visual style",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.campaign_id:
        payload = fetch_campaign_from_supabase(args.campaign_id)
    else:
        payload = {
            "title": args.title,
            "location": args.location,
            "address": args.address,
            "date": args.date,
            "start_time": args.start_time,
            "end_time": args.end_time,
            "description": args.description,
        }

    campaign = FlyerCampaignData.from_dict(payload)
    output_path = generate_flyer_pdf(campaign, Path(args.output), style=args.style)
    print(f"Saved PDF flyer to: {output_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
