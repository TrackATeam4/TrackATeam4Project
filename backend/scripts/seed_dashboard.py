"""
Seed the database with realistic campaigns, impact reports, flyer templates,
and volunteer signups so the admin dashboard looks populated.

Usage:
    cd backend
    python3 scripts/seed_dashboard.py

Safe to run multiple times — skips existing campaigns by title.
"""

import os
import sys
import random
import uuid
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

# ── Fake organizer pool (will be created if not present) ────────────────────
ORGANIZERS = [
    {"name": "Henry He",         "email": "hhernye@gmail.com"},
    {"name": "Stefan Fernandez", "email": "stefanekfernandez@gmail.com"},
    {"name": "Viral D",          "email": "virald0401@gmail.com"},
]

VOLUNTEERS = [
    {"name": "Jose Reyes",      "email": "jose.reyes@lemontree.org"},
    {"name": "Aisha Brown",     "email": "aisha.brown@lemontree.org"},
    {"name": "Carlos Mendez",   "email": "carlos.mendez@lemontree.org"},
    {"name": "Priya Sharma",    "email": "priya.sharma@lemontree.org"},
    {"name": "James Okafor",    "email": "james.okafor@lemontree.org"},
    {"name": "Yuki Tanaka",     "email": "yuki.tanaka@lemontree.org"},
    {"name": "Diana Chen",      "email": "diana.chen@lemontree.org"},
    {"name": "Marcus Williams", "email": "marcus.williams@lemontree.org"},
    {"name": "Fatima Al-Zahra", "email": "fatima.alzahra@lemontree.org"},
    {"name": "Leo Novak",       "email": "leo.novak@lemontree.org"},
    {"name": "Serena Park",     "email": "serena.park@lemontree.org"},
    {"name": "Omar Hassan",     "email": "omar.hassan@lemontree.org"},
    {"name": "Maya Johnson",    "email": "maya.johnson@lemontree.org"},
    {"name": "Ethan Williams",  "email": "ethan.williams@lemontree.org"},
    {"name": "Sofia Garcia",    "email": "sofia.garcia@lemontree.org"},
]

# ── NYC-area campaign data ───────────────────────────────────────────────────
today = date.today()

CAMPAIGNS = [
    # Completed (in the past)
    {
        "title": "Brooklyn Food Drive - Bushwick",
        "description": "Distributing flyers to recruit volunteers for the weekly Bushwick Community Fridge.",
        "location": "Bushwick, Brooklyn",
        "address": "1085 Gates Ave, Brooklyn, NY 11221",
        "latitude": 40.6929, "longitude": -73.9124,
        "date": str(today - timedelta(days=45)),
        "start_time": "09:00", "end_time": "13:00",
        "status": "completed",
        "max_volunteers": 15, "target_flyers": 500,
        "tags": ["food", "community", "brooklyn"],
        "flyers_distributed": 487, "families_reached": 132, "volunteers_attended": 12,
    },
    {
        "title": "Bronx Pantry Awareness Walk",
        "description": "Walking flyer campaign across the Grand Concourse to spread awareness of local food pantries.",
        "location": "Grand Concourse, Bronx",
        "address": "1 E 161st St, Bronx, NY 10451",
        "latitude": 40.8276, "longitude": -73.9256,
        "date": str(today - timedelta(days=30)),
        "start_time": "10:00", "end_time": "14:00",
        "status": "completed",
        "max_volunteers": 20, "target_flyers": 800,
        "flyers_distributed": 762, "families_reached": 218, "volunteers_attended": 17,
    },
    {
        "title": "Queens Hunger Awareness Blitz",
        "description": "Mass flyer distribution across Jackson Heights targeting Spanish and Bengali speaking communities.",
        "location": "Jackson Heights, Queens",
        "address": "74-09 37th Ave, Jackson Heights, NY 11372",
        "latitude": 40.7462, "longitude": -73.8918,
        "date": str(today - timedelta(days=20)),
        "start_time": "08:30", "end_time": "12:30",
        "status": "completed",
        "max_volunteers": 25, "target_flyers": 1000,
        "flyers_distributed": 1024, "families_reached": 305, "volunteers_attended": 22,
    },
    {
        "title": "Harlem Community Kitchen Outreach",
        "description": "Flyer distribution to inform residents about Harlem's free meal programs.",
        "location": "East Harlem, Manhattan",
        "address": "2253 3rd Ave, New York, NY 10035",
        "latitude": 40.7967, "longitude": -73.9392,
        "date": str(today - timedelta(days=60)),
        "start_time": "09:00", "end_time": "13:00",
        "status": "completed",
        "max_volunteers": 10, "target_flyers": 400,
        "flyers_distributed": 389, "families_reached": 95, "volunteers_attended": 9,
    },
    {
        "title": "Staten Island Food Pantry Drive",
        "description": "Reaching underserved communities in Staten Island's North Shore with pantry flyers.",
        "location": "Port Richmond, Staten Island",
        "address": "130 Port Richmond Ave, Staten Island, NY 10302",
        "latitude": 40.6282, "longitude": -74.1385,
        "date": str(today - timedelta(days=12)),
        "start_time": "10:00", "end_time": "15:00",
        "status": "completed",
        "max_volunteers": 18, "target_flyers": 700,
        "flyers_distributed": 651, "families_reached": 174, "volunteers_attended": 14,
    },
    # Published (upcoming / active)
    {
        "title": "Lower East Side Flyer Blitz",
        "description": "Targeting LES residents with bilingual (English/Spanish) flyers for local food resources.",
        "location": "Lower East Side, Manhattan",
        "address": "174 Delancey St, New York, NY 10002",
        "latitude": 40.7190, "longitude": -73.9850,
        "date": str(today + timedelta(days=5)),
        "start_time": "09:00", "end_time": "13:00",
        "status": "published",
        "max_volunteers": 20, "target_flyers": 800,
        "flyers_distributed": 0, "families_reached": 0, "volunteers_attended": 0,
    },
    {
        "title": "South Bronx Weekend Outreach",
        "description": "Partnering with local churches for a large-scale flyer distribution in Mott Haven.",
        "location": "Mott Haven, Bronx",
        "address": "380 E 149th St, Bronx, NY 10455",
        "latitude": 40.8128, "longitude": -73.9225,
        "date": str(today + timedelta(days=10)),
        "start_time": "10:00", "end_time": "14:00",
        "status": "published",
        "max_volunteers": 30, "target_flyers": 1200,
        "flyers_distributed": 0, "families_reached": 0, "volunteers_attended": 0,
    },
    {
        "title": "Crown Heights Community Food Walk",
        "description": "Flyer distribution across Crown Heights with multilingual materials.",
        "location": "Crown Heights, Brooklyn",
        "address": "671 New York Ave, Brooklyn, NY 11203",
        "latitude": 40.6637, "longitude": -73.9416,
        "date": str(today + timedelta(days=18)),
        "start_time": "09:30", "end_time": "13:30",
        "status": "published",
        "max_volunteers": 15, "target_flyers": 600,
        "flyers_distributed": 0, "families_reached": 0, "volunteers_attended": 0,
    },
    {
        "title": "Flushing Multilingual Pantry Drive",
        "description": "Reaching Mandarin, Korean, and Spanish speaking residents with translated flyers.",
        "location": "Flushing, Queens",
        "address": "41-17 Main St, Flushing, NY 11355",
        "latitude": 40.7575, "longitude": -73.8330,
        "date": str(today + timedelta(days=25)),
        "start_time": "08:00", "end_time": "12:00",
        "status": "published",
        "max_volunteers": 25, "target_flyers": 1000,
        "flyers_distributed": 0, "families_reached": 0, "volunteers_attended": 0,
    },
    # Draft
    {
        "title": "Washington Heights Summer Drive",
        "description": "Planning phase — large-scale outreach targeting the Dominican community in WaHi.",
        "location": "Washington Heights, Manhattan",
        "address": "4140 Broadway, New York, NY 10033",
        "latitude": 40.8516, "longitude": -73.9373,
        "date": str(today + timedelta(days=40)),
        "start_time": "09:00", "end_time": "14:00",
        "status": "draft",
        "max_volunteers": 35, "target_flyers": 1500,
        "flyers_distributed": 0, "families_reached": 0, "volunteers_attended": 0,
    },
    {
        "title": "Sunset Park Weekend Blitz",
        "description": "Draft — pending flyer translation to Chinese and Spanish.",
        "location": "Sunset Park, Brooklyn",
        "address": "5th Ave & 44th St, Brooklyn, NY 11220",
        "latitude": 40.6468, "longitude": -74.0042,
        "date": str(today + timedelta(days=55)),
        "start_time": "10:00", "end_time": "14:00",
        "status": "draft",
        "max_volunteers": 20, "target_flyers": 800,
        "flyers_distributed": 0, "families_reached": 0, "volunteers_attended": 0,
    },
]

FLYER_TEMPLATES = [
    {
        "name": "Classic Yellow Flyer",
        "file_url": "https://storage.lemontree.org/flyers/classic-yellow.pdf",
        "thumbnail_url": "https://storage.lemontree.org/flyers/classic-yellow-thumb.png",
        "is_active": True,
    },
    {
        "name": "Bilingual English/Spanish",
        "file_url": "https://storage.lemontree.org/flyers/bilingual-es.pdf",
        "thumbnail_url": "https://storage.lemontree.org/flyers/bilingual-es-thumb.png",
        "is_active": True,
    },
    {
        "name": "Mandarin Community Template",
        "file_url": "https://storage.lemontree.org/flyers/mandarin-cn.pdf",
        "thumbnail_url": "https://storage.lemontree.org/flyers/mandarin-cn-thumb.png",
        "is_active": True,
    },
    {
        "name": "Simple Black & White",
        "file_url": "https://storage.lemontree.org/flyers/simple-bw.pdf",
        "thumbnail_url": None,
        "is_active": False,
    },
]


def find_or_create_user(sb, user: dict, role: str = "volunteer") -> str:
    res = sb.table("users").select("id").eq("email", user["email"]).limit(1).execute()
    if res.data:
        return res.data[0]["id"]
    new_id = str(uuid.uuid4())
    sb.table("users").insert({
        "id": new_id,
        "email": user["email"],
        "name": user["name"],
        "role": role,
    }).execute()
    print(f"  Created user: {user['name']} ({role})")
    return new_id


def seed_users(sb):
    print("\n── Users ──")
    org_ids = [find_or_create_user(sb, o, "volunteer") for o in ORGANIZERS]
    vol_ids = [find_or_create_user(sb, v, "volunteer") for v in VOLUNTEERS]
    print(f"  {len(org_ids)} organizers, {len(vol_ids)} volunteers ready")
    return org_ids, vol_ids


def seed_flyer_templates(sb):
    print("\n── Flyer Templates ──")
    existing = sb.table("flyer_templates").select("name").execute()
    existing_names = {r["name"] for r in (existing.data or [])}
    inserted = 0
    for t in FLYER_TEMPLATES:
        if t["name"] in existing_names:
            continue
        try:
            sb.table("flyer_templates").insert({
                "id": str(uuid.uuid4()),
                **t,
            }).execute()
            print(f"  Created template: {t['name']}")
            inserted += 1
        except Exception as e:
            print(f"  Skip template {t['name']}: {e}")
    print(f"  {inserted} templates created")


def seed_campaigns(sb, org_ids: list) -> list:
    print("\n── Campaigns ──")
    existing = sb.table("campaigns").select("title").execute()
    existing_titles = {r["title"] for r in (existing.data or [])}
    campaign_ids = []
    inserted = 0

    for idx, c in enumerate(CAMPAIGNS):
        if c["title"] in existing_titles:
            # Fetch its id
            res = sb.table("campaigns").select("id").eq("title", c["title"]).limit(1).execute()
            if res.data:
                campaign_ids.append((res.data[0]["id"], c))
            continue

        organizer_id = org_ids[idx % len(org_ids)]
        campaign_id = str(uuid.uuid4())
        try:
            sb.table("campaigns").insert({
                "id": campaign_id,
                "organizer_id": organizer_id,
                "title": c["title"],
                "description": c["description"],
                "location": c["location"],
                "address": c["address"],
                "latitude": c["latitude"],
                "longitude": c["longitude"],
                "date": c["date"],
                "start_time": c["start_time"],
                "end_time": c["end_time"],
                "status": c["status"],
                "max_volunteers": c["max_volunteers"],
                "target_flyers": c["target_flyers"],
                "tags": c.get("tags", []),
            }).execute()
            campaign_ids.append((campaign_id, c))
            print(f"  [{c['status']:10}] {c['title'][:50]}")
            inserted += 1
        except Exception as e:
            print(f"  Error creating campaign '{c['title']}': {e}")

    print(f"  {inserted} campaigns created")
    return campaign_ids


def seed_signups(sb, campaign_ids: list, vol_ids: list):
    print("\n── Signups ──")
    total = 0
    for cid, camp in campaign_ids:
        n = random.randint(3, min(camp["max_volunteers"], len(vol_ids)))
        selected = random.sample(vol_ids, n)

        existing = sb.table("signups").select("user_id").eq("campaign_id", cid).execute()
        already = {r["user_id"] for r in (existing.data or [])}
        to_insert = [uid for uid in selected if uid not in already]

        if not to_insert:
            continue

        rows = []
        for i, uid in enumerate(to_insert):
            if camp["status"] == "completed":
                status = "confirmed"
            elif i < len(to_insert) // 2:
                status = "confirmed"
            else:
                status = "pending"
            rows.append({"campaign_id": cid, "user_id": uid, "status": status})

        try:
            sb.table("signups").insert(rows).execute()
            total += len(rows)
        except Exception as e:
            print(f"  Error inserting signups for {cid}: {e}")

    print(f"  {total} signups inserted")


def seed_impact_reports(sb, campaign_ids: list, org_ids: list):
    print("\n── Impact Reports ──")
    total = 0
    for cid, camp in campaign_ids:
        if camp["status"] != "completed":
            continue

        existing = sb.table("impact_reports").select("id").eq("campaign_id", cid).limit(1).execute()
        if existing.data:
            continue

        try:
            sb.table("impact_reports").insert({
                "id": str(uuid.uuid4()),
                "campaign_id": cid,
                "submitted_by": org_ids[0],
                "flyers_distributed": camp["flyers_distributed"],
                "families_reached": camp["families_reached"],
                "volunteers_attended": camp["volunteers_attended"],
                "notes": f"Successful outreach event. Community response was very positive.",
            }).execute()
            print(f"  Impact report for: {camp['title'][:50]}")
            total += 1
        except Exception as e:
            print(f"  Error inserting impact report: {e}")

    print(f"  {total} impact reports created")


def seed_points(sb, vol_ids: list):
    print("\n── Volunteer Points ──")
    total = 0
    for uid in vol_ids:
        # Check if they already have points
        existing = sb.table("user_points").select("id").eq("user_id", uid).limit(1).execute()
        if existing.data:
            continue
        pts = random.randint(50, 800)
        try:
            sb.table("user_points").insert({
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "points": pts,
                "reason": "Volunteer campaign participation",
            }).execute()
            total += 1
        except Exception:
            # Table may not exist or have different schema — skip silently
            pass
    if total:
        print(f"  {total} point records created")
    else:
        print("  Skipped (no user_points table or already seeded)")


def main():
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])

    org_ids, vol_ids = seed_users(sb)
    seed_flyer_templates(sb)
    campaign_ids = seed_campaigns(sb, org_ids)
    seed_signups(sb, campaign_ids, vol_ids)
    seed_impact_reports(sb, campaign_ids, org_ids)
    seed_points(sb, vol_ids)

    print("\n✓ Seed complete.")


if __name__ == "__main__":
    main()
