# TrackA Backend Chat API

This backend now includes session-based chat orchestration for event creation.

## Endpoints

- `POST /chat/session`
- `GET /chat/session/{session_id}`
- `POST /chat/message`
- `POST /chat/message/stream` (SSE)
- `POST /chat/session/{session_id}/context`
- `GET /chat/session/{session_id}/check-conflicts`
- `GET /chat/session/{session_id}/suggest-pantries`
- `POST /chat/session/{session_id}/create-campaign`
- `POST /chat/session/{session_id}/generate-flyer`

All `/chat/*` endpoints require `Authorization: Bearer <supabase_jwt>`.

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Smoke Check (No Server Required)

```bash
python3 smoke_chat.py
```

This runs an in-process session + turn flow and prints the agent payload.
If Supabase auth dependencies are unavailable locally, the smoke run falls back to an anonymous test user.
