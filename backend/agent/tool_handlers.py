"""
Tool execution handlers — REAL IMPLEMENTATION using Lemontree API.

Lemontree API Base URL: https://platform.foodhelpline.org
All endpoints are public (no auth required) and CORS-enabled.

Responses are superjson-serialized. We use raw.json directly 
and parse dates manually where needed.
"""

import httpx
import json
from typing import Any

from supabase_client import get_supabase_client

LEMONTREE_BASE = "https://platform.foodhelpline.org"


# ============================================================
# GEOCODING HELPER
# ============================================================

async def geocode_location(location: str) -> dict | None:
    """
    Convert a location string to lat/lng.
    
    Strategy:
    1. If it looks like a zip code, use Lemontree's own API 
       (it accepts ?location=zipcode and returns resolved coords)
    2. Otherwise, use a free geocoding API (Nominatim)
    """
    # Check if it's a zip code (5 digits)
    clean = location.strip()
    if clean.isdigit() and len(clean) == 5:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{LEMONTREE_BASE}/api/resources",
                params={"location": clean, "take": 1}
            )
            if resp.status_code == 200:
                data = resp.json()
                loc = data.get("json", {}).get("location")
                if loc:
                    return {
                        "lat": loc["latitude"],
                        "lng": loc["longitude"],
                        "name": loc.get("name", clean)
                    }
    
    # Use Nominatim (OpenStreetMap) for free geocoding
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": location,
                "format": "json",
                "limit": 1,
                "countrycodes": "us"
            },
            headers={"User-Agent": "LemontreeVolunteerApp/1.0"}
        )
        if resp.status_code == 200:
            results = resp.json()
            if results:
                return {
                    "lat": float(results[0]["lat"]),
                    "lng": float(results[0]["lon"]),
                    "name": results[0].get("display_name", location)
                }
    
    return None


# ============================================================
# TOOL HANDLERS
# ============================================================

async def handle_search_food_pantries(params: dict) -> dict:
    """
    Search for food pantries near a location using Lemontree's REAL API.
    Uses: GET /api/resources?lat=...&lng=...&take=...
    """
    location = params.get("location", "")
    
    # Geocode the location to get lat/lng
    coords = await geocode_location(location)
    if not coords:
        return {
            "status": "error",
            "message": f"Could not find coordinates for '{location}'. Try a more specific address or zip code."
        }
    
    # Query Lemontree API for nearby resources
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{LEMONTREE_BASE}/api/resources",
            params={
                "lat": coords["lat"],
                "lng": coords["lng"],
                "take": 10,
                "sort": "distance"
            }
        )
        
        if resp.status_code != 200:
            return {
                "status": "error",
                "message": f"Lemontree API returned status {resp.status_code}"
            }
        
        data = resp.json()
        raw = data.get("json", {})
        resources = raw.get("resources", [])
    
    # Parse into a clean format for the agent
    pantries = []
    for r in resources:
        # Build address string
        addr_parts = [
            r.get("addressStreet1"),
            r.get("city"),
            r.get("state"),
            r.get("zipCode")
        ]
        address = ", ".join(p for p in addr_parts if p)
        
        # Get resource type
        resource_type = "Food Pantry"
        if r.get("resourceType", {}).get("id") == "SOUP_KITCHEN":
            resource_type = "Soup Kitchen"
        
        # Parse upcoming occurrences (next open times)
        upcoming = []
        for occ in r.get("occurrences", [])[:3]:
            if not occ.get("skippedAt"):
                upcoming.append({
                    "start": occ.get("startTime"),
                    "end": occ.get("endTime"),
                    "confirmed": occ.get("confirmedAt") is not None
                })
        
        # Parse recurring schedule from shifts
        schedule_info = []
        for shift in r.get("shifts", [])[:3]:
            pattern = shift.get("recurrencePattern", "")
            if pattern:
                schedule_info.append(pattern)
        
        # Get distance if available
        distance_meters = None
        if r.get("travelSummary"):
            distance_meters = r["travelSummary"].get("distance")
        
        distance_str = ""
        if distance_meters:
            miles = distance_meters / 1609.34
            distance_str = f"{miles:.1f} miles away"
        
        # Get tags
        tags = [t.get("name", "") for t in r.get("tags", [])]
        
        pantry = {
            "id": r.get("id"),
            "name": r.get("name", "Unknown"),
            "type": resource_type,
            "address": address,
            "distance": distance_str,
            "distance_meters": distance_meters,
            "upcoming_occurrences": upcoming,
            "schedule_rules": schedule_info,
            "phone": None,
            "rating": r.get("ratingAverage"),
            "reviews_count": r.get("_count", {}).get("reviews", 0),
            "tags": tags,
            "description": r.get("description"),
            "description_es": r.get("description_es"),
            "latitude": r.get("latitude"),
            "longitude": r.get("longitude"),
            "website": r.get("website"),
        }
        
        # Get phone if available
        contacts = r.get("contacts", [])
        if contacts:
            pantry["phone"] = contacts[0].get("phone")
        
        pantries.append(pantry)
    
    return {
        "status": "success",
        "location_searched": location,
        "coordinates": coords,
        "total_found": raw.get("count", len(pantries)),
        "pantries": pantries
    }


async def handle_create_campaign_event(params: dict, user_id: str | None = None) -> dict:
    """
    Create a new campaign event in the database.
    
    Inserts into the Supabase 'posts' table.
    """
    if not user_id:
        return {
            "status": "error",
            "message": "Missing authenticated user for campaign creation.",
        }

    supabase = get_supabase_client()
    row = {
        "author_id": user_id,
        "type": "upcoming_event",
        "title": params["title"],
        "content": params["description"],
        "event_location": params["location"],
        "event_date": params["date"],
        "event_time_start": params["time_start"],
        "event_time_end": params["time_end"],
        "volunteer_goal": params["volunteer_goal"],
        "flyer_goal": params["flyer_goal"],
        "event_lat": params.get("latitude"),
        "event_lng": params.get("longitude"),
    }

    try:
        result = supabase.table("posts").insert(row).execute()
    except Exception as exc:
        return {
            "status": "error",
            "message": f"Failed to create campaign event: {exc}",
        }

    event = (result.data or [None])[0] or {}
    event_id = event.get("id")

    return {
        "status": "success",
        "event_id": event_id,
        "message": f"Campaign '{params['title']}' created successfully!",
        "signup_link": f"/events/{event_id}" if event_id else "/events",
        "details": {
            "title": params["title"],
            "location": params["location"],
            "date": params["date"],
            "time": f"{params['time_start']} - {params['time_end']}",
            "volunteer_goal": params["volunteer_goal"],
            "flyer_goal": params["flyer_goal"],
        },
    }


async def handle_generate_personalized_flyer(params: dict) -> dict:
    """
    Generate a personalized flyer using Lemontree's REAL flyer PDF API.
    Uses: GET /api/resources.pdf?lat=...&lng=...&locationName=...&flyerLang=...
    
    This endpoint automatically:
    - Finds up to 4 nearby resources (1 soup kitchen + 3 pantries)
    - Generates a QR code linking to Lemontree
    - Returns a print-ready branded PDF
    """
    location_name = params.get("location_name", "")
    language = params.get("language", "english")
    lat = params.get("latitude")
    lng = params.get("longitude")
    custom_message = params.get("custom_message", "")
    
    # If we don't have coordinates, try to geocode
    if not lat or not lng:
        coords = await geocode_location(location_name)
        if coords:
            lat = coords["lat"]
            lng = coords["lng"]
        else:
            return {
                "status": "error",
                "message": f"Could not geocode '{location_name}'. Please provide a more specific address."
            }
    
    # Verify the flyer can be generated (check if location is in service area)
    flyer_url_check = f"{LEMONTREE_BASE}/api/resources.pdf?lat={lat}&lng={lng}&locationName={location_name}&flyerLang=en"
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.head(flyer_url_check, follow_redirects=True)
            if resp.status_code == 422:
                return {
                    "status": "error",
                    "message": f"'{location_name}' is outside Lemontree's service area. No flyer can be generated."
                }
            elif resp.status_code == 400:
                return {
                    "status": "error",
                    "message": "Invalid coordinates provided."
                }
        except httpx.RequestError:
            # If we can't verify, still return the URLs — they'll work when the user clicks them
            pass
    
    # Build download URLs for both languages
    from urllib.parse import quote
    safe_name = quote(location_name)
    flyer_url_en = f"{LEMONTREE_BASE}/api/resources.pdf?lat={lat}&lng={lng}&locationName={safe_name}&flyerLang=en"
    flyer_url_es = f"{LEMONTREE_BASE}/api/resources.pdf?lat={lat}&lng={lng}&locationName={safe_name}&flyerLang=es"
    
    result = {
        "status": "success",
        "message": f"Flyer generated for {location_name}!",
        "flyer_download_url_english": flyer_url_en,
        "flyer_download_url_spanish": flyer_url_es,
        "location": {
            "name": location_name,
            "lat": lat,
            "lng": lng
        },
        "notes": [
            "The flyer automatically includes the top 4 nearest food resources",
            "A QR code linking to Lemontree is included",
            "Lemontree branding and messaging is maintained automatically",
            f"Custom message from organizer: '{custom_message}'" if custom_message else "No custom message added"
        ],
        "print_tips": [
            "Print on standard letter paper (8.5 x 11 inches)",
            f"Recommended quantity: {params.get('print_quantity', 'based on volunteer count and area')}",
            "Color printing is preferred but B&W works too"
        ]
    }
    
    if language == "both":
        result["recommendation"] = "Print half in English and half in Spanish for maximum reach."
    
    return result


async def handle_draft_invite_messages(params: dict) -> dict:
    """
    Generate invite messages for different channels.
    Returns ready-to-copy messages for text, email, Instagram, WhatsApp.
    """
    event_title = params.get("event_title", "Flyering Campaign")
    location = params.get("location", "")
    date = params.get("date", "")
    time = params.get("time", "")
    spots = params.get("spots_available", 0)
    link = params.get("signup_link", "https://your-app.com")
    channels = params.get("channels", ["text_message", "email", "instagram", "whatsapp"])
    
    messages = {}
    
    if "text_message" in channels:
        messages["text_message"] = {
            "label": "Text Message (SMS)",
            "content": (
                f"Hey! I'm organizing a flyering event for Lemontree to help families find free food. "
                f"\n📍 {location}"
                f"\n📅 {date}, {time}"
                f"\nWe need {spots} more volunteers — it's easy and fun! "
                f"\nSign up: {link} 🍋"
            )
        }
    
    if "email" in channels:
        messages["email"] = {
            "label": "Email",
            "subject": f"Volunteer with me: {event_title}",
            "content": (
                f"Hi there,\n\n"
                f"I'm helping organize a flyering campaign for Lemontree — a nonprofit that connects "
                f"families to free food resources in their neighborhood.\n\n"
                f"Event Details:\n"
                f"📍 Location: {location}\n"
                f"📅 Date: {date}\n"
                f"⏰ Time: {time}\n"
                f"👥 Spots available: {spots}\n\n"
                f"It's a simple but impactful way to help — we walk around the neighborhood and hand "
                f"out flyers so families know where to find free food nearby.\n\n"
                f"Sign up here: {link}\n\n"
                f"Hope to see you there! 🍋\n"
            )
        }
    
    if "instagram" in channels:
        messages["instagram"] = {
            "label": "Instagram Caption",
            "content": (
                f"🍋 VOLUNTEERS NEEDED 🍋\n\n"
                f"Join me for a flyering campaign with @lemontreefoodhelpline "
                f"to help families find free food!\n\n"
                f"📍 {location}\n"
                f"📅 {date} | {time}\n\n"
                f"It takes just a few hours and makes a real difference. "
                f"Link in bio to sign up ➡️\n\n"
                f"#Lemontree #VolunteerNYC #FoodAccess #CommunityAction #FightHunger"
            )
        }
    
    if "whatsapp" in channels:
        messages["whatsapp"] = {
            "label": "WhatsApp Message",
            "content": (
                f"🍋 Hey! Want to volunteer this weekend?\n\n"
                f"I'm organizing a flyering event for *Lemontree* — we help families find free food "
                f"near them.\n\n"
                f"📍 {location}\n📅 {date}, {time}\n👥 {spots} spots left\n\n"
                f"Sign up: {link}\n\nWould love your help! 💛"
            )
        }
    
    return {
        "status": "success",
        "event_title": event_title,
        "messages": messages,
        "tip": "Copy any message and paste it directly. The sign-up link is included in each one."
    }


async def handle_suggest_zone_assignments(params: dict) -> dict:
    """
    Suggest zone assignments for volunteers.
    Uses Lemontree's API to find nearby landmarks (pantries, soup kitchens)
    and builds zones around them.
    """
    location = params.get("location", "")
    num_volunteers = params.get("num_volunteers", 1)
    names = params.get("volunteer_names", [])
    focus_spots = params.get("focus_spots", [])
    
    # Fill in generic names if not provided
    while len(names) < num_volunteers:
        names.append(f"Volunteer {len(names) + 1}")
    
    # Get nearby food resources to use as zone anchors
    coords = await geocode_location(location)
    nearby_resources = []
    
    if coords:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{LEMONTREE_BASE}/api/resources",
                params={
                    "lat": coords["lat"],
                    "lng": coords["lng"],
                    "take": num_volunteers * 2,
                    "sort": "distance"
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                resources = data.get("json", {}).get("resources", [])
                for r in resources:
                    addr = r.get("addressStreet1", "")
                    city = r.get("city", "")
                    nearby_resources.append({
                        "name": r.get("name", "Unknown"),
                        "type": r.get("resourceType", {}).get("id", ""),
                        "address": f"{addr}, {city}" if addr else city,
                        "lat": r.get("latitude"),
                        "lng": r.get("longitude"),
                    })
    
    return {
        "status": "success",
        "location": location,
        "coordinates": coords,
        "num_zones": num_volunteers,
        "volunteer_names": names[:num_volunteers],
        "nearby_food_resources": nearby_resources,
        "focus_spots": focus_spots,
        "instructions": (
            f"Create {num_volunteers} non-overlapping zones around {location}. "
            f"Use the nearby food resources as zone anchors — volunteers should flyer "
            f"NEAR these pantries/kitchens so families learn about the resources closest to them. "
            f"Also consider high-traffic spots: schools, transit stops, laundromats, "
            f"and places of worship. Each zone should have roughly equal area."
        )
    }


async def handle_generate_impact_summary(params: dict) -> dict:
    """
    Generate an impact summary from raw event data.
    The AI agent will use this data to write both:
    1. A social-media-ready shareable summary
    2. A structured report for the admin dashboard
    """
    return {
        "status": "success",
        "raw_data": {
            "event": params.get("event_title", ""),
            "location": params.get("location", ""),
            "date": params.get("date", ""),
            "volunteers": params.get("num_volunteers", 0),
            "flyers": params.get("flyers_distributed", 0),
            "blocks": params.get("blocks_covered", 0),
            "notes": params.get("notes", "")
        },
        "format_instructions": (
            "Generate two versions: "
            "1) A short, upbeat social media post (under 280 chars) with emoji "
            "2) A structured impact report with: volunteers, flyers, area covered, "
            "key observations, and recommendations for future events in this area."
        )
    }


# ============================================================
# TOOL DISPATCH
# ============================================================

TOOL_HANDLERS = {
    "search_food_pantries": handle_search_food_pantries,
    "create_campaign_event": handle_create_campaign_event,
    "generate_personalized_flyer": handle_generate_personalized_flyer,
    "draft_invite_messages": handle_draft_invite_messages,
    "suggest_zone_assignments": handle_suggest_zone_assignments,
    "generate_impact_summary": handle_generate_impact_summary,
}


async def execute_tool(tool_name: str, tool_input: dict, user_id: str | None = None) -> Any:
    """Execute a tool by name and return the result."""
    handler = TOOL_HANDLERS.get(tool_name)
    if handler is None:
        return {"error": f"Unknown tool: {tool_name}"}
    try:
        if tool_name == "create_campaign_event":
            return await handler(tool_input, user_id=user_id)
        return await handler(tool_input)
    except Exception as e:
        return {"error": f"Tool '{tool_name}' failed: {str(e)}"}
