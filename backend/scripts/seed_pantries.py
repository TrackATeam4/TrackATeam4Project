"""
Seed food_pantries table from the Lemontree API.

Usage:
    cd backend
    python3 scripts/seed_pantries.py

Fetches FOOD_PANTRY and SOUP_KITCHEN resources from the Lemontree public API
for the NYC metro area, then upserts them into Supabase.
"""

import os
import sys
import time
import urllib.request
import urllib.parse
import json
import uuid

# Allow running from the backend directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

LEMONTREE_BASE = "https://platform.foodhelpline.org"
TAKE = 100  # max per page

# NYC borough centers — query from each to get full coverage
QUERY_CENTERS = [
    ("Manhattan",     40.7831, -73.9712),
    ("Brooklyn",      40.6782, -73.9442),
    ("Queens",        40.7282, -73.7949),
    ("Bronx",         40.8448, -73.8648),
    ("Staten Island", 40.5795, -74.1502),
]


def fetch_page(lat: float, lng: float, cursor: str | None) -> dict:
    params: dict = {"lat": lat, "lng": lng, "take": TAKE, "sort": "distance"}
    if cursor:
        params["cursor"] = cursor
    qs = urllib.parse.urlencode(params)
    url = f"{LEMONTREE_BASE}/api/resources?{qs}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = json.loads(resp.read().decode())
    # Lemontree uses superjson wrapper: { json: {...}, meta: {...} }
    return raw.get("json", raw)


def build_address(r: dict) -> str:
    parts = [
        r.get("addressStreet1") or "",
        r.get("addressStreet2") or "",
        r.get("city") or "",
        r.get("state") or "",
        r.get("zipCode") or "",
    ]
    return ", ".join(p for p in parts if p).strip(", ")


def build_hours(shifts: list) -> dict:
    """Convert Lemontree shifts into a simple day→time-range dict."""
    day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    hours: dict = {}
    for shift in shifts:
        for occ in shift.get("tags", []):
            pass  # tags not useful for hours
        # Use startTime/endTime from shift if available
        start = shift.get("startTime")
        end = shift.get("endTime")
        loc_name = shift.get("locationName") or ""
        if start and end:
            try:
                from datetime import datetime
                s = datetime.fromisoformat(start.replace("Z", "+00:00"))
                e = datetime.fromisoformat(end.replace("Z", "+00:00"))
                day = day_names[s.weekday() % 7]
                time_str = f"{s.strftime('%I:%M %p')} – {e.strftime('%I:%M %p')}"
                if loc_name:
                    time_str += f" ({loc_name})"
                if day not in hours:
                    hours[day] = time_str
                else:
                    hours[day] += f", {time_str}"
            except Exception:
                pass
    return hours


def to_row(r: dict) -> dict | None:
    lat = r.get("latitude")
    lng = r.get("longitude")
    name = r.get("name") or ""
    status = (r.get("resourceStatus") or {}).get("id", "")

    # Skip if no coords, no name, or not published
    if not lat or not lng or not name or status != "PUBLISHED":
        return None

    address = build_address(r)
    if not address:
        return None

    phone = None
    contacts = r.get("contacts") or []
    if contacts:
        phone = contacts[0].get("phone")

    services = [t["name"] for t in (r.get("tags") or []) if t.get("name")]
    hours = build_hours(r.get("shifts") or [])
    description = r.get("description") or None
    website = r.get("website") or None
    is_verified = True  # only PUBLISHED resources are seeded

    return {
        "id": str(uuid.uuid4()),
        "name": name[:255],
        "description": description,
        "address": address[:500],
        "latitude": float(lat),
        "longitude": float(lng),
        "phone": (phone or "")[:30] or None,
        "website": (website or "")[:500] or None,
        "hours": hours,
        "services": services,
        "is_verified": is_verified,
    }


def main():
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])

    # Load existing name+address pairs to avoid duplicates
    existing = sb.table("food_pantries").select("name, address").execute()
    seen: set[tuple] = {(r["name"].lower(), r["address"].lower()) for r in (existing.data or [])}
    print(f"Existing pantries in DB: {len(seen)}")

    total_inserted = 0
    total_skipped = 0

    for area_name, lat, lng in QUERY_CENTERS:
        print(f"\n--- {area_name} ({lat}, {lng}) ---")
        cursor = None
        page = 0

        while True:
            try:
                data = fetch_page(lat, lng, cursor)
            except Exception as exc:
                print(f"  Fetch error: {exc}")
                break

            resources = data.get("resources") or []
            cursor = data.get("cursor")
            page += 1
            print(f"  Page {page}: {len(resources)} resources (cursor: {bool(cursor)})")

            batch = []
            for r in resources:
                row = to_row(r)
                if not row:
                    total_skipped += 1
                    continue
                key = (row["name"].lower(), row["address"].lower())
                if key in seen:
                    total_skipped += 1
                    continue
                seen.add(key)
                batch.append(row)

            if batch:
                try:
                    sb.table("food_pantries").insert(batch).execute()
                    total_inserted += len(batch)
                    print(f"  Inserted {len(batch)} pantries")
                except Exception as exc:
                    print(f"  Insert error: {exc}")

            if not cursor:
                break

            time.sleep(0.3)  # be polite to the API

    print(f"\nDone. Inserted: {total_inserted}, Skipped/filtered: {total_skipped}")


if __name__ == "__main__":
    main()
