"""
Seed fake + real volunteer users and their signups across campaigns.

Usage:
    cd backend
    python3 scripts/seed_volunteers.py

Creates volunteer rows in the public 'users' table and inserts signups
linking those volunteers to existing published campaigns.
"""

import os
import random
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

# ── Fake volunteer pool ───────────────────────────────────────────────────────

FAKE_VOLUNTEERS = [
    {"name": "Jose Reyes",     "email": "jose.reyes@lemontree.org"},
    {"name": "Aisha Brown",    "email": "aisha.brown@lemontree.org"},
    {"name": "Carlos Mendez",  "email": "carlos.mendez@lemontree.org"},
    {"name": "Priya Sharma",   "email": "priya.sharma@lemontree.org"},
    {"name": "James Okafor",   "email": "james.okafor@lemontree.org"},
    {"name": "Yuki Tanaka",    "email": "yuki.tanaka@lemontree.org"},
    {"name": "Diana Chen",     "email": "diana.chen@lemontree.org"},
    {"name": "Marcus Williams","email": "marcus.williams@lemontree.org"},
    {"name": "Fatima Al-Zahra","email": "fatima.alzahra@lemontree.org"},
    {"name": "Leo Novak",      "email": "leo.novak@lemontree.org"},
    {"name": "Serena Park",    "email": "serena.park@lemontree.org"},
    {"name": "Omar Hassan",    "email": "omar.hassan@lemontree.org"},
]

# Real test users — these must match what's in Supabase auth (or at least
# be findable via public.users). They're included so email flows are testable.
REAL_VOLUNTEERS = [
    {"name": "Henry He",   "email": "hhernye@gmail.com"},
    {"name": "Stefan",     "email": "stefanekfernandez@gmail.com"},
    {"name": "Viral",      "email": "virald0401@gmail.com"},
]

ALL_VOLUNTEERS = FAKE_VOLUNTEERS + REAL_VOLUNTEERS

SIGNUPS_PER_CAMPAIGN = 5   # how many volunteers to assign per campaign
MAX_CAMPAIGNS = 12          # seed at most this many campaigns


def find_or_create_user(sb, vol: dict) -> str:
    """Return existing user id or create a new public.users row."""
    res = sb.table("users").select("id").eq("email", vol["email"]).limit(1).execute()
    if res.data:
        return res.data[0]["id"]

    new_id = str(uuid.uuid4())
    sb.table("users").insert({
        "id": new_id,
        "email": vol["email"],
        "name": vol["name"],
        "role": "volunteer",
    }).execute()
    print(f"  Created user: {vol['name']} <{vol['email']}>  id={new_id[:8]}…")
    return new_id


def main():
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])

    # ── Ensure all volunteer user rows exist ──────────────────────────────────
    print("Ensuring volunteer users exist…")
    vol_ids: list[str] = []
    for vol in ALL_VOLUNTEERS:
        uid = find_or_create_user(sb, vol)
        vol_ids.append(uid)

    print(f"  {len(vol_ids)} volunteers ready.\n")

    # ── Fetch published campaigns ─────────────────────────────────────────────
    camps_res = (
        sb.table("campaigns")
        .select("id, title, organizer_id")
        .eq("status", "published")
        .order("created_at", desc=True)
        .limit(MAX_CAMPAIGNS)
        .execute()
    )
    campaigns = camps_res.data or []
    if not campaigns:
        # Fall back to any campaigns if none published
        camps_res = (
            sb.table("campaigns")
            .select("id, title, organizer_id")
            .order("created_at", desc=True)
            .limit(MAX_CAMPAIGNS)
            .execute()
        )
        campaigns = camps_res.data or []

    if not campaigns:
        print("No campaigns found — run seed_pantries.py or create a campaign first.")
        return

    print(f"Found {len(campaigns)} campaigns to seed.\n")

    total_inserted = 0

    for camp in campaigns:
        cid = camp["id"]
        organizer_id = camp.get("organizer_id")

        # Skip the organizer from being a volunteer in their own campaign
        eligible_ids = [uid for uid, vol in zip(vol_ids, ALL_VOLUNTEERS)
                        if uid != organizer_id]

        # Get existing signups so we don't duplicate
        existing_res = (
            sb.table("signups")
            .select("user_id")
            .eq("campaign_id", cid)
            .execute()
        )
        already_signed_up = {r["user_id"] for r in (existing_res.data or [])}

        available = [uid for uid in eligible_ids if uid not in already_signed_up]
        to_sign_up = random.sample(available, min(SIGNUPS_PER_CAMPAIGN, len(available)))

        if not to_sign_up:
            print(f"  [{camp['title'][:40]}] — already seeded, skipping")
            continue

        rows = []
        for i, uid in enumerate(to_sign_up):
            # Mix statuses: first half confirmed, rest pending
            status = "confirmed" if i < len(to_sign_up) // 2 else "pending"
            rows.append({
                "campaign_id": cid,
                "user_id": uid,
                "status": status,
            })

        try:
            sb.table("signups").insert(rows).execute()
            conf = sum(1 for r in rows if r["status"] == "confirmed")
            pend = len(rows) - conf
            print(f"  [{camp['title'][:40]}] +{len(rows)} signups ({conf} confirmed, {pend} pending)")
            total_inserted += len(rows)
        except Exception as exc:
            print(f"  Error seeding campaign {cid}: {exc}")

    print(f"\nDone. Inserted {total_inserted} signups total.")


if __name__ == "__main__":
    main()
