"""
Tool definitions following Anthropic's tool_use format.
Updated to leverage Lemontree's real API capabilities.
"""

TOOLS = [
    {
        "name": "search_food_pantries",
        "description": (
            "Search for food pantries and soup kitchens near a given location using "
            "Lemontree's real database. Returns actual resource names, addresses, hours, "
            "types, distance, ratings, and upcoming open times. Use this when a volunteer "
            "mentions a location for their flyering campaign. Accepts addresses, "
            "neighborhoods, landmarks, or zip codes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": (
                        "The address, neighborhood, landmark, or zip code to search near "
                        "(e.g., 'Sunset Park, Brooklyn', '123 Main St, New York, NY', or '11220')"
                    )
                },
                "radius_miles": {
                    "type": "number",
                    "description": "Search radius in miles. Default 1.5. Increase for less dense areas.",
                    "default": 1.5
                }
            },
            "required": ["location"]
        }
    },
    {
        "name": "create_campaign_event",
        "description": (
            "Create a new flyering campaign event. Use this once you have enough details "
            "from the volunteer: location, date, time, and goals. Infer reasonable defaults "
            "when possible (e.g., 3-hour window, flyer goal = 30 per volunteer)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "A short, descriptive title (e.g., 'Sunset Park Flyering Blitz')"
                },
                "location": {
                    "type": "string",
                    "description": "The location/address for the campaign"
                },
                "latitude": {
                    "type": "number",
                    "description": "Latitude of the location (from search_food_pantries results)"
                },
                "longitude": {
                    "type": "number",
                    "description": "Longitude of the location (from search_food_pantries results)"
                },
                "date": {
                    "type": "string",
                    "description": "Event date in YYYY-MM-DD format"
                },
                "time_start": {
                    "type": "string",
                    "description": "Start time in HH:MM format (24h)"
                },
                "time_end": {
                    "type": "string",
                    "description": "End time in HH:MM format (24h)"
                },
                "volunteer_goal": {
                    "type": "integer",
                    "description": "Number of volunteers needed"
                },
                "flyer_goal": {
                    "type": "integer",
                    "description": "Target number of flyers to distribute"
                },
                "description": {
                    "type": "string",
                    "description": "Campaign description for the event listing"
                }
            },
            "required": [
                "title", "location", "date", "time_start",
                "time_end", "volunteer_goal", "flyer_goal", "description"
            ]
        }
    },
    {
        "name": "generate_personalized_flyer",
        "description": (
            "Generate an official Lemontree-branded flyer PDF for a specific location. "
            "Uses Lemontree's real flyer API which automatically finds the nearest food "
            "resources, adds them to a print-ready flyer with QR code and branding. "
            "Available in English and Spanish. Returns download URLs for the PDFs. "
            "You MUST provide latitude and longitude — get these from the "
            "search_food_pantries results."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "location_name": {
                    "type": "string",
                    "description": (
                        "Human-readable name printed on the flyer "
                        "(e.g., 'Brooklyn Public Library', 'Near PS 234')"
                    )
                },
                "latitude": {
                    "type": "number",
                    "description": "Latitude — get this from search_food_pantries results"
                },
                "longitude": {
                    "type": "number",
                    "description": "Longitude — get this from search_food_pantries results"
                },
                "language": {
                    "type": "string",
                    "enum": ["english", "spanish", "both"],
                    "description": "Language for the flyer. 'both' generates two versions."
                },
                "custom_message": {
                    "type": "string",
                    "description": "Optional custom message from the volunteer"
                },
                "print_quantity": {
                    "type": "string",
                    "description": "Suggested print quantity (e.g., '100 copies' or '20 per volunteer')"
                }
            },
            "required": ["location_name", "latitude", "longitude", "language"]
        }
    },
    {
        "name": "draft_invite_messages",
        "description": (
            "Generate ready-to-copy invitation messages for the volunteer to share and "
            "recruit more volunteers. Generates channel-specific messages (text, email, "
            "Instagram, WhatsApp) with event details and signup link included."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "event_title": {
                    "type": "string",
                    "description": "The campaign event title"
                },
                "location": {
                    "type": "string",
                    "description": "Event location"
                },
                "date": {
                    "type": "string",
                    "description": "Event date (human readable, e.g., 'Saturday, March 21')"
                },
                "time": {
                    "type": "string",
                    "description": "Event time range (e.g., '10 AM - 1 PM')"
                },
                "spots_available": {
                    "type": "integer",
                    "description": "Number of volunteer spots still open"
                },
                "signup_link": {
                    "type": "string",
                    "description": "Link for volunteers to sign up"
                },
                "channels": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["text_message", "email", "instagram", "whatsapp"]
                    },
                    "description": "Which channels to generate messages for"
                }
            },
            "required": [
                "event_title", "location", "date",
                "time", "spots_available", "channels"
            ]
        }
    },
    {
        "name": "suggest_zone_assignments",
        "description": (
            "Suggest how to divide a flyering area into zones and assign volunteers "
            "to prevent overlap. Uses real nearby food resource locations as zone anchors "
            "so volunteers flyer near actual pantries. Each volunteer gets a distinct area."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The general area/neighborhood for flyering"
                },
                "num_volunteers": {
                    "type": "integer",
                    "description": "Number of volunteers to assign zones to"
                },
                "volunteer_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of volunteer names for personalized assignments"
                },
                "focus_spots": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional high-priority locations to cover (e.g., 'schools', 'library')"
                }
            },
            "required": ["location", "num_volunteers"]
        }
    },
    {
    "name": "web_search",
    "description": (
        "Search the web for information about food assistance programs, "
        "SNAP benefits, food insecurity, volunteer tips, or any question "
        "related to Lemontree's mission of helping families find free food. "
        "Use this when the volunteer asks a question that your other tools "
        "cannot answer."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query"
            }
        },
        "required": ["query"]
    }
},
    {
        "name": "generate_impact_summary",
        "description": (
            "Generate a formatted impact summary from raw post-event data reported by "
            "volunteers. Creates both a social-media-ready shareable post and a structured "
            "report for the admin dashboard."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "event_title": {
                    "type": "string",
                    "description": "The campaign event title"
                },
                "location": {
                    "type": "string",
                    "description": "Where the event took place"
                },
                "date": {
                    "type": "string",
                    "description": "When the event took place"
                },
                "num_volunteers": {
                    "type": "integer",
                    "description": "How many volunteers participated"
                },
                "flyers_distributed": {
                    "type": "integer",
                    "description": "How many flyers were handed out"
                },
                "blocks_covered": {
                    "type": "integer",
                    "description": "How many blocks/streets were covered"
                },
                "notes": {
                    "type": "string",
                    "description": "Raw notes from the volunteer about how it went"
                }
            },
            "required": [
                "event_title", "location",
                "num_volunteers", "flyers_distributed"
            ]
        }
    }
]
