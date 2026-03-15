"""
Seed the campaigns table with realistic synthetic data.

Usage:
    cd backend
    python3 scripts/seed_campaigns.py [--count 40] [--clear]

Options:
    --count N   Number of campaigns to insert (default: 40)
    --clear     Delete all existing campaigns before seeding

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) in .env.
The script creates a throwaway organizer user if none exist, or reuses an
existing one — it does NOT require you to be logged in.
"""

import argparse
import os
import random
import sys
import uuid
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

# ── Supabase client ────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ["SUPABASE_URL"]
# Prefer service-role key (bypasses RLS); fall back to anon key
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_KEY")
    or os.environ["SUPABASE_ANON_KEY"]
)
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Realistic data pools ───────────────────────────────────────────────────────

# (location_name, street_address, lat, lng, borough)
NYC_LOCATIONS = [
    ("Sunset Park",          "4th Ave & 43rd St, Brooklyn, NY 11232",         40.6470, -74.0100, "Brooklyn"),
    ("Washington Heights",   "Broadway & 181st St, New York, NY 10033",       40.8493, -73.9376, "Manhattan"),
    ("Flushing",             "Main St & Roosevelt Ave, Flushing, NY 11354",   40.7575, -73.8330, "Queens"),
    ("South Bronx",          "149th St & 3rd Ave, Bronx, NY 10451",           40.8168, -73.9186, "Bronx"),
    ("East Harlem",          "Lexington Ave & 116th St, New York, NY 10029",  40.7965, -73.9418, "Manhattan"),
    ("Bushwick",             "Knickerbocker Ave & Myrtle Ave, Brooklyn, NY 11237", 40.6967, -73.9163, "Brooklyn"),
    ("Jackson Heights",      "74th St & Roosevelt Ave, Jackson Heights, NY 11372", 40.7474, -73.8904, "Queens"),
    ("Bedford-Stuyvesant",   "Fulton St & Bedford Ave, Brooklyn, NY 11216",   40.6872, -73.9554, "Brooklyn"),
    ("Crown Heights",        "Eastern Pkwy & Nostrand Ave, Brooklyn, NY 11225", 40.6692, -73.9506, "Brooklyn"),
    ("Morris Heights",       "University Ave & W Tremont Ave, Bronx, NY 10453", 40.8481, -73.9174, "Bronx"),
    ("Chinatown",            "Canal St & Mott St, New York, NY 10013",         40.7158, -73.9970, "Manhattan"),
    ("Jamaica",              "Jamaica Ave & 165th St, Jamaica, NY 11432",      40.7021, -73.7969, "Queens"),
    ("Hunts Point",          "Spofford Ave & Edgewater Rd, Bronx, NY 10474",  40.8143, -73.8899, "Bronx"),
    ("Brownsville",          "Pitkin Ave & Rockaway Ave, Brooklyn, NY 11212",  40.6644, -73.9108, "Brooklyn"),
    ("Fordham",              "Fordham Rd & Grand Concourse, Bronx, NY 10458", 40.8605, -73.8986, "Bronx"),
    ("Astoria",              "Steinway St & 30th Ave, Astoria, NY 11103",      40.7718, -73.9098, "Queens"),
    ("Inwood",               "Dyckman St & Sherman Ave, New York, NY 10034",   40.8663, -73.9249, "Manhattan"),
    ("East New York",        "Atlantic Ave & Pennsylvania Ave, Brooklyn, NY 11207", 40.6670, -73.8836, "Brooklyn"),
    ("Mott Haven",           "Willis Ave & 138th St, Bronx, NY 10454",         40.8088, -73.9249, "Bronx"),
    ("Woodside",             "61st St & Roosevelt Ave, Woodside, NY 11377",    40.7448, -73.9033, "Queens"),
]

TITLE_TEMPLATES = [
    "{neighborhood} Weekend Flyer Push",
    "{neighborhood} Community Outreach — {month}",
    "Food Access Awareness: {neighborhood}",
    "{neighborhood} Volunteer Drive",
    "Lemontree x {neighborhood} Flyering Day",
    "{neighborhood} Block-by-Block Outreach",
    "Spread the Word: {neighborhood} Edition",
    "{neighborhood} Saturday Crew",
    "{neighborhood} Morning Blitz",
    "{neighborhood} After-School Flyer Run",
    "Get the Word Out — {neighborhood}",
    "{neighborhood} Community Walk & Flyer",
    "Early Bird Outreach · {neighborhood}",
    "{neighborhood} Neighborhood Canvas",
    "Join Us in {neighborhood} — Flyering Event",
]

DESCRIPTIONS = [
    "Join us as we hand out flyers about local food resources to families in the area. No experience needed — just bring your energy and willingness to help neighbors find the support they deserve.",
    "We'll be walking the main commercial strip and residential blocks, connecting with community members and sharing info about nearby food pantries. Great for first-time volunteers!",
    "This is a focused outreach event near a local school and community center. We'll target foot traffic during the morning rush and early afternoon. Bring comfortable shoes.",
    "We're partnering with a local faith organization to reach families in need. Volunteers will be assigned a block route and given a stack of flyers and a short talking-points card.",
    "Quick two-hour flyering session near the transit hub. Perfect if you only have a couple hours to spare. Team leaders will be on-site to keep things organized.",
    "Morning outreach focusing on apartment buildings and bodegas along the avenue. We'll split into small groups of 2–3 and cover the area systematically.",
    "Community-led event organized by local volunteers. We'll be near the farmers market and laundromat — high foot traffic spots where residents are receptive.",
    "This campaign is part of our city-wide awareness push. Every flyer counts — each one could connect a family to a meal they didn't know was available.",
    "Afternoon session targeting the after-school pickup crowd near the elementary school and daycare on the block. Child-friendly, family-oriented outreach.",
    "We'll focus on senior-heavy residential buildings this time, going floor by floor with permission from building staff. Bring patience and a friendly smile.",
    "Join our consistent monthly crew for this neighborhood. Veteran volunteers will mentor new ones. Light snacks provided after the shift.",
    "Evening outreach targeting commuters and residents coming home from work. High visibility, high impact. Reflective vests provided.",
    "We're concentrating on the housing projects this session, working with resident association liaisons who've cleared our access. Meaningful and impactful.",
    None,
    None,
]

TAGS_POOL = [
    ["weekend", "family-friendly"],
    ["morning", "transit-hub"],
    ["spanish", "bilingual"],
    ["evening", "commuter-traffic"],
    ["senior-focused", "residential"],
    ["school-zone", "kids"],
    ["first-time-friendly", "training-provided"],
    ["recurring", "monthly"],
    ["chinese", "multilingual"],
    ["high-traffic", "commercial"],
    ["apartment-buildings", "door-to-door"],
    ["faith-partner", "community-org"],
    ["weekend"],
    ["spanish", "family-friendly", "school-zone"],
    [],
]

# Realistic time slots (start_time, end_time)
TIME_SLOTS = [
    ("08:00:00", "10:00:00"),
    ("09:00:00", "11:00:00"),
    ("09:30:00", "12:00:00"),
    ("10:00:00", "12:30:00"),
    ("11:00:00", "13:00:00"),
    ("13:00:00", "15:00:00"),
    ("14:00:00", "16:30:00"),
    ("15:00:00", "17:00:00"),
    ("16:00:00", "18:30:00"),
    ("17:00:00", "19:00:00"),
]

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

STATUSES = ["published", "published", "published", "published", "draft", "completed", "completed"]


def _rand_date(start_offset_days: int = -90, end_offset_days: int = 120) -> date:
    today = date.today()
    delta = random.randint(start_offset_days, end_offset_days)
    return today + timedelta(days=delta)


def _get_or_create_organizer() -> str:
    """Return the id of an existing organizer/admin user, or insert a seed one."""
    # Pick any existing user to act as organizer
    result = sb.table("users").select("id").limit(1).execute()
    if result.data:
        return result.data[0]["id"]

    # No users at all — insert a placeholder with the default volunteer role
    seed_id = str(uuid.uuid4())
    sb.table("users").insert({
        "id": seed_id,
        "email": "seed-organizer@lemontree.internal",
        "name": "Seed Organizer",
    }).execute()
    print("  Created placeholder seed user.")
    return seed_id


def build_campaign(organizer_id: str) -> dict:
    loc = random.choice(NYC_LOCATIONS)
    neighborhood, address, lat, lng, _ = loc

    campaign_date = _rand_date(-60, 120)
    start_time, end_time = random.choice(TIME_SLOTS)
    month_name = MONTHS[campaign_date.month - 1]

    title_tmpl = random.choice(TITLE_TEMPLATES)
    title = title_tmpl.format(neighborhood=neighborhood, month=month_name)

    description = random.choice(DESCRIPTIONS)

    # Status: past events lean toward completed, future lean published/draft
    today = date.today()
    if campaign_date < today - timedelta(days=3):
        status = random.choices(
            ["completed", "published", "cancelled"],
            weights=[70, 20, 10],
        )[0]
    elif campaign_date <= today + timedelta(days=3):
        status = random.choices(["published", "draft"], weights=[80, 20])[0]
    else:
        status = random.choices(["published", "draft"], weights=[60, 40])[0]

    # Add small realistic coordinate jitter (±0.005° ≈ ±500m)
    jitter_lat = lat + random.uniform(-0.005, 0.005)
    jitter_lng = lng + random.uniform(-0.005, 0.005)

    tags = random.choice(TAGS_POOL)
    target_flyers = random.choice([50, 75, 100, 100, 150, 200, 250, 300, 400, 500])
    max_volunteers = random.choice([None, None, None, 5, 8, 10, 12, 15, 20, 25])

    return {
        "organizer_id": organizer_id,
        "title": title,
        "description": description,
        "location": neighborhood,
        "address": address,
        "date": campaign_date.isoformat(),
        "start_time": start_time,
        "end_time": end_time,
        "status": status,
        "latitude": round(jitter_lat, 6),
        "longitude": round(jitter_lng, 6),
        "tags": tags,
        "target_flyers": target_flyers,
        "max_volunteers": max_volunteers,
    }


def main():
    parser = argparse.ArgumentParser(description="Seed campaigns with synthetic data.")
    parser.add_argument("--count", type=int, default=40, help="Number of campaigns to insert (default: 40)")
    parser.add_argument("--clear", action="store_true", help="Delete all existing campaigns before seeding")
    args = parser.parse_args()

    if args.clear:
        print("Clearing existing campaigns…")
        sb.table("campaigns").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        print("  Done.")

    print("Resolving organizer user…")
    organizer_id = _get_or_create_organizer()
    print(f"  Using organizer id: {organizer_id}")

    print(f"Generating {args.count} campaigns…")
    campaigns = [build_campaign(organizer_id) for _ in range(args.count)]

    # Insert in batches of 20 to stay within Supabase limits
    batch_size = 20
    inserted = 0
    for i in range(0, len(campaigns), batch_size):
        batch = campaigns[i : i + batch_size]
        sb.table("campaigns").insert(batch).execute()
        inserted += len(batch)
        print(f"  Inserted {inserted}/{args.count}…")

    print(f"\nDone — {inserted} campaigns seeded successfully.")

    # Quick summary
    statuses: dict[str, int] = {}
    for c in campaigns:
        statuses[c["status"]] = statuses.get(c["status"], 0) + 1
    for status, count in sorted(statuses.items()):
        print(f"  {status}: {count}")


if __name__ == "__main__":
    main()
