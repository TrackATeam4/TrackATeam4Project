
## Step 1 — Session Management

Before sending the first message, the frontend calls:

```
POST /chat/session
Authorization: Bearer <supabase_jwt>
```

Response:
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "context": {}
  }
}
```

All subsequent messages include `session_id`. You retrieve session history from:

```
GET /chat/session/{session_id}
```

Response includes full message history + current context:
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "status": "active",
    "context": {
      "title": "Hyde Park Flyering",
      "location": "Hyde Park",
      "date": null,
      "start_time": null,
      "end_time": null,
      "max_volunteers": null,
      "target_flyers": null,
      "tags": [],
      "food_pantry_id": null
    },
    "messages": [
      { "role": "user",      "content": "I want to organize a flyering event" },
      { "role": "assistant", "content": "Great! What neighborhood?" }
    ]
  }
}
```

---

## Step 2 — The Main Message Endpoint

```
POST /chat/message
Authorization: Bearer <supabase_jwt>

{
  "session_id": "uuid",
  "message": "I want to run a flyering event in Hyde Park next Saturday"
}
```

Your LangChain agent processes this, decides what tools to call, and returns:

```json
{
  "success": true,
  "data": {
    "reply": "Got it — Hyde Park on March 21st. How many volunteers are you expecting?",
    "context": {
      "location": "Hyde Park",
      "date": "2026-03-21",
      "max_volunteers": null
    },
    "action": null
  }
}
```

When the campaign is fully created, return:
```json
{
  "success": true,
  "data": {
    "reply": "Your event is live! I've created the campaign and your flyer is ready to download.",
    "context": { ... },
    "action": {
      "type": "campaign_created",
      "campaign_id": "uuid",
      "flyer_url": "https://storage.supabase.co/..."
    }
  }
}
```

---

## Step 3 — Tool Endpoints (what you call from LangChain)

### Tool 1 — Save a collected field to session context

```
POST /chat/session/{session_id}/context
Authorization: Bearer <token>

{ "field": "location", "value": "Hyde Park" }
```

Valid fields: `title`, `location`, `address`, `latitude`, `longitude`, `date`,
`start_time`, `end_time`, `max_volunteers`, `target_flyers`, `tags`, `food_pantry_id`

Response:
```json
{ "success": true, "data": { "context": { "location": "Hyde Park", ... } } }
```

---

### Tool 2 — Check for scheduling conflicts

```
GET /chat/session/{session_id}/check-conflicts
```

Checks if there's already a campaign at a similar location and date.

Response:
```json
{
  "success": true,
  "data": {
    "has_conflict": true,
    "conflicts": [
      {
        "id": "uuid",
        "title": "Hyde Park Morning Run",
        "date": "2026-03-21",
        "start_time": "09:00",
        "distance_km": 0.3
      }
    ]
  }
}
```

Use this before creating — warn the user and let them decide.

---

### Tool 3 — Suggest nearby food pantries

```
GET /chat/session/{session_id}/suggest-pantries
```

Uses the `location` saved in session context to find nearby pantries.

Response:
```json
{
  "success": true,
  "data": {
    "pantries": [
      {
        "id": "uuid",
        "name": "Hyde Park Community Pantry",
        "distance_km": 0.8,
        "services": ["produce", "canned_goods", "diapers"]
      }
    ]
  }
}
```

You can offer: *"There's a food pantry 0.8km away. Want to link your event to them?"*

---

### Tool 4 — Create the campaign

Call this only when ALL required fields are collected: `title`, `location`, `address`, `date`, `start_time`, `end_time`.

```
POST /chat/session/{session_id}/create-campaign
Authorization: Bearer <token>
```

No body needed — backend reads from session context.

Response:
```json
{
  "success": true,
  "data": {
    "campaign_id": "uuid",
    "title": "Hyde Park Flyering",
    "date": "2026-03-21"
  }
}
```

---

### Tool 5 — Generate a flyer

Call after campaign is created.

```
POST /chat/session/{session_id}/generate-flyer Or we can just use Lemontree API directly but their design is ass
Authorization: Bearer <token>

{ "template_id": "uuid" }
```

If no `template_id`, backend picks the default active template.

Response:
```json
{
  "success": true,
  "data": {
    "flyer_url": "https://storage.supabase.co/.../flyer.pdf",
    "thumbnail_url": "https://storage.supabase.co/.../thumb.png"
  }
}
```

---

## Step 4 — LangChain Agent Setup (Python)

BASE_URL = "http://localhost:8000"

def make_headers(token: str):
    return {"Authorization": f"Bearer {token}"}

# ── Tools ────────────────────────────────────────────────

@tool
def save_event_field(session_id: str, field: str, value: str, token: str) -> dict:
    """Save a collected event field (title, location, date, etc.) to the session."""
    r = httpx.post(f"{BASE_URL}/chat/session/{session_id}/context",
                   json={"field": field, "value": value},
                   headers=make_headers(token))
    return r.json()

@tool
def check_conflicts(session_id: str, token: str) -> dict:
    """Check if there are scheduling conflicts for the current session's location and date."""
    r = httpx.get(f"{BASE_URL}/chat/session/{session_id}/check-conflicts",
                  headers=make_headers(token))
    return r.json()

@tool
def suggest_nearby_pantries(session_id: str, token: str) -> dict:
    """Find nearby food pantries to optionally link to the event."""
    r = httpx.get(f"{BASE_URL}/chat/session/{session_id}/suggest-pantries",
                  headers=make_headers(token))
    return r.json()

@tool
def create_campaign(session_id: str, token: str) -> dict:
    """Create the event campaign from collected session context. Call only when all required fields are present."""
    r = httpx.post(f"{BASE_URL}/chat/session/{session_id}/create-campaign",
                   headers=make_headers(token))
    return r.json()

@tool
def generate_flyer(session_id: str, token: str, template_id: str = None) -> dict:
    """Generate a flyer for the created campaign."""
    body = {"template_id": template_id} if template_id else {}
    r = httpx.post(f"{BASE_URL}/chat/session/{session_id}/generate-flyer",
                   json=body, headers=make_headers(token))
    return r.json()


tools = [save_event_field, check_conflicts, suggest_nearby_pantries,
         create_campaign, generate_flyer]

agent = create_tool_calling_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# ── Run a turn ─────────────────────────────────────────────

def run_turn(session_id: str, user_message: str, chat_history: list, token: str) -> str:
    result = agent_executor.invoke({
        "input": user_message,
        "chat_history": chat_history,
        "session_id": session_id,
        "token": token,
    })
    return result["output"]
```

---

## Step 5 — Streaming 

If you want to stream the assistant reply token by token:

```python
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler

llm = ChatBedrock(
    model_id=ModelOfYourChoice,
    region_name=AWS_DEFAULT_REGION,
    streaming=True,
    callbacks=[StreamingStdOutCallbackHandler()],
)
```

The backend will expose a streaming endpoint using FastAPI `StreamingResponse`:

```python
@router.post("/chat/message/stream")
async def stream_message(body: ChatMessageRequest):
    async def token_generator():
        async for chunk in agent_executor.astream({"input": body.message, ...}):
            yield f"data: {chunk}\n\n"
    return StreamingResponse(token_generator(), media_type="text/event-stream")
```

Frontend receives tokens via `EventSource` and renders them progressively.

---

## Required Fields Checklist (before calling create_campaign)

```python
REQUIRED_FIELDS = ["title", "location", "address", "date", "start_time", "end_time"]

def is_ready_to_create(context: dict) -> bool:
    return all(context.get(f) for f in REQUIRED_FIELDS)
```


