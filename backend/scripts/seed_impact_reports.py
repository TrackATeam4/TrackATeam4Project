"""
Seed impact_reports for all completed campaigns that don't have one.

Usage:
    cd backend
    python3 scripts/seed_impact_reports.py
"""

import os
import sys
import random
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client


def main():
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])

    # Fetch all completed campaigns
    camps_res = (
        sb.table("campaigns")
        .select("id, title, organizer_id, max_volunteers, target_flyers")
        .eq("status", "completed")
        .execute()
    )
    campaigns = camps_res.data or []
    print(f"Found {len(campaigns)} completed campaigns")

    # Fetch existing impact reports
    existing_res = sb.table("impact_reports").select("campaign_id").execute()
    already_reported = {r["campaign_id"] for r in (existing_res.data or [])}
    print(f"Already have reports for {len(already_reported)} campaigns")

    # Fetch an admin/organizer user id to use as submitter
    submitter_res = (
        sb.table("users")
        .select("id")
        .eq("role", "admin")
        .limit(1)
        .execute()
    )
    fallback_submitter = (submitter_res.data or [{}])[0].get("id")
    if not fallback_submitter:
        # Use first user found
        any_user = sb.table("users").select("id").limit(1).execute()
        fallback_submitter = (any_user.data or [{}])[0].get("id")

    inserted = 0
    for camp in campaigns:
        cid = camp["id"]
        if cid in already_reported:
            continue

        # Realistic numbers relative to campaign targets
        max_vols = camp.get("max_volunteers") or random.randint(8, 25)
        target_flyers = camp.get("target_flyers") or random.randint(300, 1200)

        volunteers_attended = random.randint(max(1, int(max_vols * 0.6)), max_vols)
        # Flyers: 85-105% of target
        flyers = int(target_flyers * random.uniform(0.82, 1.08))
        # Families: roughly 1 family per 3-4 flyers
        families = int(flyers / random.uniform(2.8, 4.2))

        submitter = camp.get("organizer_id") or fallback_submitter
        if not submitter:
            continue

        try:
            sb.table("impact_reports").insert({
                "id": str(uuid.uuid4()),
                "campaign_id": cid,
                "submitted_by": submitter,
                "flyers_distributed": flyers,
                "families_reached": families,
                "volunteers_attended": volunteers_attended,
                "notes": "Community response was positive. Great volunteer turnout.",
            }).execute()
            print(f"  ✓ {camp['title'][:55]:<55} {flyers:>5} flyers  {families:>4} families  {volunteers_attended:>3} vols")
            inserted += 1
        except Exception as e:
            print(f"  ✗ {camp['title'][:55]} — {e}")

    print(f"\nDone. {inserted} impact reports created.")


if __name__ == "__main__":
    main()
