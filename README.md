# TrackATeam — Lemontree Volunteer Campaign Platform

TrackATeam is a full-stack volunteer coordination platform that helps organizers run food drives and community events. Organizers create campaigns through an AI-powered chatbot, invite volunteers via email, generate PDF flyers, post to Bluesky, and track impact — all in one place.

**Live site:** [track-a-team4-project.vercel.app](https://track-a-team4-project.vercel.app)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
  - [Auth](#auth)
  - [Campaigns](#campaigns)
  - [Feed & Discovery](#feed--discovery)
  - [Map](#map)
  - [Chat & AI Agent](#chat--ai-agent)
  - [Invitations & Email](#invitations--email)
  - [Tasks](#tasks)
  - [Leaderboard & Rewards](#leaderboard--rewards)
  - [Impact Reports](#impact-reports)
  - [Flyers](#flyers)
  - [Promotion](#promotion)
  - [Bluesky Social](#bluesky-social)
- [AI Agent Architecture](#ai-agent-architecture)
- [Services](#services)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Features

- **AI Campaign Builder** — Conversational chatbot (powered by AWS Bedrock Nova Pro) walks organizers through creating campaigns step by step, auto-generating flyers and Bluesky posts.
- **Campaign Management** — Full CRUD for volunteer campaigns with status tracking (draft → published → completed → cancelled).
- **Interactive Discover Map** — Mapbox-powered map showing nearby campaigns and food pantries with radius filtering.
- **Volunteer Signups & Check-in** — Authenticated signup flow, self-check-in (with or without auth), and organizer-confirmed attendance.
- **Email Invitations** — Branded HTML invite emails with RSVP links, Google Calendar URLs, and `.ics` attachments via Resend.
- **PDF Flyer Generator** — Three poster styles (`color_blocked`, `modern_bordered`, `dark_centered`) rendered in-memory with fpdf2 and uploaded to Supabase Storage.
- **Gamification** — Points, levels (Seedling → Lemontree Champion), and badges awarded for organizing, attending, and reporting impact.
- **Leaderboard** — Global and proximity-based leaderboards with period filtering (weekly, monthly, all-time).
- **Impact Reports** — Post-event reporting for flyers distributed, families reached, and volunteers attended.
- **Personalized Feed** — Recommendation engine scoring campaigns by proximity, interest tags, urgency, social proof, novelty, and promotion boost.
- **Campaign Promotion** — 24-hour boost that increases feed ranking by 20%.
- **Task Assignment** — Organizers create tasks per campaign; volunteers self-assign or get assigned by the organizer.
- **Bluesky Integration** — Post campaign announcements directly to Bluesky via the AT Protocol.
- **Automated Reminders** — APScheduler background job sends reminder emails 24h and 1h before events.
- **Admin Dashboard** — Admin panel for managing campaigns, users, pantries, and viewing analytics.
- **Google OAuth & Email/Password Auth** — Supabase Auth with PKCE flow, password reset, and session management.

---

## Tech Stack

| Layer        | Technology                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| **Frontend** | Next.js 16, React 19, TypeScript, TailwindCSS 4, Mapbox GL, Framer Motion, Recharts |
| **Backend**  | FastAPI, Python 3.12+, Uvicorn, Pydantic v2                               |
| **AI/Agent** | AWS Bedrock (Nova Pro v1), LangGraph, LangChain, DuckDuckGo search        |
| **Database** | Supabase (PostgreSQL), Row-Level Security                                  |
| **Auth**     | Supabase Auth (Email/Password + Google OAuth, PKCE flow)                   |
| **Storage**  | Supabase Storage (flyer PDFs)                                              |
| **Email**    | Resend (invites, confirmations, reminders)                                 |
| **Social**   | Bluesky / AT Protocol                                                      |
| **PDF**      | fpdf2 (in-memory PDF generation)                                           |
| **Geocoding**| OpenStreetMap Nominatim (free, no API key)                                 |
| **Scheduler**| APScheduler (background reminder jobs)                                     |
| **Testing**  | pytest + pytest-cov (backend), Playwright (frontend E2E)                   |
| **Deploy**   | Vercel (frontend), Render / manual (backend)                               |

---

## Project Structure

```
TrackATeam4Project/
├── backend/
│   ├── main.py                  # FastAPI app, middleware, auth endpoints
│   ├── auth.py                  # JWT verification via Supabase
│   ├── supabase_client.py       # Supabase client singleton
│   ├── bsky_client.py           # Bluesky AT Protocol client
│   ├── requirements.txt         # Python dependencies
│   ├── routers/
│   │   ├── campaigns.py         # Campaign CRUD, signup, check-in, RSVP
│   │   ├── chat.py              # Chat sessions, AI agent message flow
│   │   ├── feed.py              # Personalized feed, trending, nearby, search
│   │   ├── map.py               # Map pins for campaigns & pantries
│   │   ├── impact.py            # Post-event impact reports
│   │   ├── tasks.py             # Task CRUD and volunteer assignment
│   │   ├── invitations.py       # Email invitations, RSVP, calendar (.ics)
│   │   ├── leaderboard.py       # Points, badges, levels, leaderboard
│   │   ├── promotion.py         # 24h campaign promotion boost
│   │   ├── flyers.py            # PDF flyer generation & templates
│   │   └── bsky.py              # Bluesky social posting
│   ├── agents/
│   │   ├── agent.py             # LangGraph 3-node orchestrator (Bedrock)
│   │   ├── chat_service.py      # System prompt & shared config
│   │   └── tools.py             # 12 LangChain tools for campaign actions
│   ├── services/
│   │   ├── rewards.py           # Points, badges, levels, scoring
│   │   ├── email_service.py     # Resend email (invites, confirmations, reminders)
│   │   ├── scheduler.py         # APScheduler background reminder jobs
│   │   ├── flyer_generator.py   # PDF poster generation (3 styles)
│   │   ├── geocoding.py         # OpenStreetMap Nominatim geocoding
│   │   ├── calendar.py          # Google Calendar URL & .ics generation
│   │   └── event_normalization.py # Flexible date/time parsing (dateparser)
│   ├── routes/
│   │   └── map.py               # Admin map/pantry/analytics endpoints
│   ├── scripts/                 # Seed scripts (pantries, volunteers, dashboard)
│   ├── migrations/              # SQL migrations (rewards, chat, auth sync, seeds)
│   └── tests/                   # 17 test modules, ~200+ tests
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Landing page (Hero, HowItWorks, AI Showcase)
│   │   │   ├── auth/            # Login / signup / OAuth callback
│   │   │   ├── home/            # Authenticated app (dashboard, campaigns, chat, etc.)
│   │   │   ├── admin/           # Admin panel (campaigns, users, pantries, flyers)
│   │   │   ├── c/               # Public campaign detail page
│   │   │   ├── chat/            # AI chatbot page
│   │   │   ├── checkin/         # Self check-in flow
│   │   │   ├── discover/        # Map discovery page
│   │   │   ├── invite/          # Public invitation RSVP page
│   │   │   ├── leaderboard/     # Leaderboard page
│   │   │   └── profile/         # User profile
│   │   ├── components/
│   │   │   ├── landing/         # Hero, HowItWorks, Testimonials, etc.
│   │   │   ├── chat/            # Chat UI components
│   │   │   ├── home/            # Home page components
│   │   │   ├── AddToCalendarButton.tsx
│   │   │   └── LemonLogo.tsx
│   │   ├── lib/
│   │   │   ├── api.ts           # authFetch / apiFetch wrappers
│   │   │   ├── auth.ts          # Sign in/up, OAuth, password reset
│   │   │   └── supabase.ts      # Supabase client (PKCE flow)
│   │   └── types/
│   │       └── supabase.ts      # Generated Supabase type definitions
│   ├── e2e/                     # Playwright E2E tests
│   ├── public/                  # Static assets (logo, icons)
│   └── package.json
├── schema.sql                   # Full database schema reference
├── docs/                        # Team documentation
└── .gitignore
```

---

## Getting Started

### Prerequisites

- **Python 3.12+** and `pip`
- **Node.js 20+** and `npm`
- A **Supabase** project (free tier works)
- AWS credentials for **Bedrock** access (for the AI agent)
- A **Resend** account (for email; optional in dev)
- A **Mapbox** access token (for the discover map)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate         # Windows

pip install -r requirements.txt

# Create .env (see Environment Variables below)
cp .env.example .env            # or create manually

uvicorn main:app --reload --port 8000
```

The API is now available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Frontend Setup

```bash
cd frontend
npm install

# Create .env.local (see Environment Variables below)

npm run dev
```

The app is now available at `http://localhost:3000`.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable                     | Description                                      |
| ---------------------------- | ------------------------------------------------ |
| `SUPABASE_URL`               | Supabase project URL                             |
| `SUPABASE_ANON_KEY`          | Supabase anonymous/public key                    |
| `AWS_BEARER_TOKEN_BEDROCK`   | AWS Bedrock bearer token for Nova Pro            |
| `AWS_REGION`                 | AWS region (default: `us-east-1`)                |
| `BEDROCK_MODEL_ID`           | Bedrock model ID (default: `us.amazon.nova-pro-v1:0`) |
| `RESEND_API_KEY`             | Resend API key for emails                        |
| `FROM_EMAIL`                 | Sender email for notifications                   |
| `FRONTEND_URL`               | Frontend URL for links in emails                 |
| `BSKY_USERNAME`              | Bluesky account username                         |
| `BSKY_PASSWORD`              | Bluesky account app password                     |
| `AGENT_BACKEND_BASE_URL`     | Backend URL for agent tool HTTP calls (default: `http://localhost:8000`) |
| `ENVIRONMENT`                | `development` or `production`                    |

### Frontend (`frontend/.env.local`)

| Variable                        | Description                      |
| ------------------------------- | -------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key    |
| `NEXT_PUBLIC_API_URL`           | Backend API base URL             |
| `NEXT_PUBLIC_MAPBOX_TOKEN`      | Mapbox GL access token           |

---

## Database Schema

The database runs on Supabase (PostgreSQL) with 15 tables:

| Table               | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `users`             | User profiles (id, email, name, role)            |
| `campaigns`         | Volunteer campaigns with geo, status, tags       |
| `signups`           | Volunteer signups (pending → confirmed → cancelled) |
| `tasks`             | Per-campaign task assignments                    |
| `invitations`       | Email invite tokens with RSVP status             |
| `impact_reports`    | Post-event metrics (flyers, families, volunteers)|
| `user_points`       | Point transactions (action, points, campaign)    |
| `user_badges`       | Earned badge records                             |
| `user_interests`    | Tag-based interest weights for feed ranking      |
| `chat_sessions`     | AI chat sessions with JSON context               |
| `chat_messages`     | Conversation history (user/assistant)            |
| `food_pantries`     | Food pantry locations with services              |
| `campaign_likes`    | Like toggle (user × campaign)                    |
| `campaign_comments` | Campaign discussion comments                     |
| `campaign_flyers`   | Generated flyer records + URLs                   |
| `flyer_templates`   | Flyer template metadata                          |

Full schema reference: [`schema.sql`](./schema.sql)

---

## API Reference

Base URL: `http://localhost:8000` (dev) | Production varies by deployment

All protected endpoints require `Authorization: Bearer <supabase_access_token>`.

### Auth

| Method | Endpoint              | Auth | Description                     |
| ------ | --------------------- | ---- | ------------------------------- |
| POST   | `/auth/signup`        | No   | Register with email/password    |
| POST   | `/auth/signin`        | No   | Login with email/password       |
| POST   | `/auth/reset-password`| No   | Send password reset email       |
| GET    | `/auth/me`            | Yes  | Get current user profile + role |

### Campaigns

| Method | Endpoint                              | Auth | Description                          |
| ------ | ------------------------------------- | ---- | ------------------------------------ |
| GET    | `/campaigns`                          | No   | Paginated list with signup/like/comment counts |
| POST   | `/campaigns`                          | Yes  | Create a campaign                    |
| GET    | `/campaigns/{id}`                     | No   | Campaign detail                      |
| PUT    | `/campaigns/{id}`                     | Yes  | Update campaign (organizer only)     |
| DELETE | `/campaigns/{id}`                     | Yes  | Cancel campaign (organizer only)     |
| GET    | `/campaigns/mine`                     | Yes  | Campaigns created by current user    |
| GET    | `/campaigns/joined`                   | Yes  | Campaigns user signed up for         |
| GET    | `/campaigns/liked`                    | Yes  | Campaign IDs the user liked          |
| POST   | `/campaigns/{id}/signup`              | Yes  | Volunteer signup                     |
| DELETE | `/campaigns/{id}/signup`              | Yes  | Withdraw signup                      |
| GET    | `/campaigns/{id}/signups`             | Yes  | List signups (organizer only)        |
| POST   | `/campaigns/{id}/confirm/{uid}`       | Yes  | Confirm attendance + award points    |
| POST   | `/campaigns/{id}/checkin`             | Opt  | Self check-in (auth or email)        |
| POST   | `/campaigns/{id}/rsvp`                | No   | Public RSVP by email                 |
| POST   | `/campaigns/{id}/remind`              | Yes  | Send reminder emails (organizer)     |
| POST   | `/campaigns/{id}/like`                | Yes  | Toggle like                          |
| GET    | `/campaigns/{id}/comments`            | No   | List comments                        |
| POST   | `/campaigns/{id}/comments`            | Yes  | Post a comment                       |
| GET    | `/campaigns/geocode?address=...`      | No   | Geocode address via OpenStreetMap    |
| GET    | `/campaigns/search`                   | No   | Search by title, tags, date range    |

### Feed & Discovery

| Method | Endpoint                | Auth | Description                              |
| ------ | ----------------------- | ---- | ---------------------------------------- |
| GET    | `/feed`                 | Yes  | Personalized ranked feed                 |
| GET    | `/feed/trending`        | No   | Top 10 by signups in last 48h            |
| GET    | `/feed/nearby`          | No   | Events within radius of lat/lng          |

### Map

| Method | Endpoint              | Auth | Description                              |
| ------ | --------------------- | ---- | ---------------------------------------- |
| GET    | `/map/campaigns`      | No   | Campaign map pins within radius          |
| GET    | `/map/food-pantries`  | No   | Food pantry map pins within radius       |

### Chat & AI Agent

| Method | Endpoint                                    | Auth | Description                                  |
| ------ | ------------------------------------------- | ---- | -------------------------------------------- |
| POST   | `/chat/session`                             | Yes  | Create new chat session                      |
| GET    | `/chat/session/{id}`                        | Yes  | Get session + messages                       |
| POST   | `/chat/message`                             | Yes  | Send message → get AI reply                  |
| POST   | `/chat/session/{id}/context`                | Yes  | Save a field to session context              |
| GET    | `/chat/session/{id}/check-conflicts`        | Yes  | Check scheduling conflicts                   |
| GET    | `/chat/session/{id}/suggest-pantries`       | Yes  | Find nearby food pantries                    |
| POST   | `/chat/session/{id}/create-campaign`        | Yes  | Create campaign from session context         |
| POST   | `/chat/session/{id}/generate-flyer`         | Yes  | Generate PDF flyer for session campaign      |
| POST   | `/chat/session/{id}/reset`                  | Yes  | Clear session for new campaign               |

### Invitations & Email

| Method | Endpoint                                | Auth | Description                              |
| ------ | --------------------------------------- | ---- | ---------------------------------------- |
| POST   | `/campaigns/{id}/invitations`           | Yes  | Send email invite (organizer only)       |
| GET    | `/campaigns/{id}/invitations`           | Yes  | List invitations (organizer only)        |
| GET    | `/campaigns/{id}/calendar-url`          | Yes  | Get Google Calendar URL                  |
| GET    | `/invitations/{token}`                  | No   | View invitation + campaign details       |
| POST   | `/invitations/{token}/accept`           | No   | Accept invitation (public RSVP)          |
| POST   | `/invitations/{token}/decline`          | No   | Decline invitation                       |
| GET    | `/invitations/{token}/calendar.ics`     | No   | Download .ics calendar file              |

### Tasks

| Method | Endpoint                           | Auth | Description                          |
| ------ | ---------------------------------- | ---- | ------------------------------------ |
| GET    | `/campaigns/{id}/tasks`            | No   | List tasks for a campaign            |
| POST   | `/campaigns/{id}/tasks`            | Yes  | Create task (organizer only)         |
| PUT    | `/tasks/{id}`                      | Yes  | Update/assign task (organizer only)  |
| DELETE | `/tasks/{id}`                      | Yes  | Delete task (organizer only)         |
| POST   | `/tasks/{id}/assign`               | Yes  | Self-assign to task                  |
| DELETE | `/tasks/{id}/assign`               | Yes  | Unassign from task                   |

### Leaderboard & Rewards

| Method | Endpoint              | Auth | Description                              |
| ------ | --------------------- | ---- | ---------------------------------------- |
| GET    | `/leaderboard`        | No   | Global leaderboard (period filter)       |
| GET    | `/leaderboard/nearby` | No   | Proximity leaderboard                    |
| GET    | `/me/points`          | Yes  | Current user points + history            |
| GET    | `/me/badges`          | Yes  | Current user badges                      |
| GET    | `/me/level`           | Yes  | Current user level                       |

**Level Progression:** Seedling (0) → Sprout (50) → Bloom (150) → Branch (350) → Lemontree Champion (700)

**Point Actions:** `organize` (50 pts), `attend` (20 pts), `report` (10 pts)

### Impact Reports

| Method | Endpoint                      | Auth | Description                           |
| ------ | ----------------------------- | ---- | ------------------------------------- |
| POST   | `/campaigns/{id}/impact`      | Yes  | Submit impact report (organizer only) |
| GET    | `/campaigns/{id}/impact`      | Yes  | Get impact report                     |

### Flyers

| Method | Endpoint           | Auth | Description                                |
| ------ | ------------------ | ---- | ------------------------------------------ |
| POST   | `/flyers`          | No   | Generate PDF flyer for a campaign          |
| GET    | `/flyers/templates`| No   | List available PDF templates from storage  |

**Poster Styles:** `color_blocked` (default), `modern_bordered`, `dark_centered`

### Promotion

| Method | Endpoint                      | Auth | Description                        |
| ------ | ----------------------------- | ---- | ---------------------------------- |
| POST   | `/campaigns/{id}/promote`     | Yes  | Boost campaign for 24h (once only) |

### Bluesky Social

| Method | Endpoint      | Auth | Description                     |
| ------ | ------------- | ---- | ------------------------------- |
| POST   | `/bsky/post`  | No   | Post content to Bluesky         |

---

## AI Agent Architecture

The campaign-building AI agent uses a **LangGraph 3-node graph** backed by AWS Bedrock (Nova Pro v1):

```
[START] → [call_model] → {route_tools?}
                            ↓ campaign_tools    ↓ web_search       ↓ no tools
                     [campaign_tools]      [web_search]           [END]
                            ↓                    ↓
                     [call_model] ←──────────────┘
```

- **Node 1 — `call_model`**: Calls Bedrock LLM, decides which tools to invoke.
- **Node 2 — `campaign_tools`**: Executes 12 Lemontree-specific tools (save fields, create campaign, generate flyer, post to Bluesky, invite volunteers, etc.).
- **Node 3 — `web_search`**: Handles general questions via DuckDuckGo.

**Auto-chaining**: When `create_campaign` succeeds, the agent automatically executes `generate_flyer` and `post_campaign_to_bluesky` in the same pass.

**12 Agent Tools**: `save_event_field`, `check_conflicts`, `suggest_nearby_pantries`, `create_campaign`, `generate_flyer`, `post_campaign_to_bluesky`, `reset_session`, `send_campaign_invite`, `send_bulk_invites`, `list_campaign_invitations`, `get_campaign_calendar_url`, `get_campaign_signups`

---

## Services

| Service                | File                            | Description                                           |
| ---------------------- | ------------------------------- | ----------------------------------------------------- |
| **Rewards**            | `services/rewards.py`           | Points, levels, badges, campaign scoring algorithm     |
| **Email**              | `services/email_service.py`     | Resend-based HTML emails (invite, confirm, remind)     |
| **Scheduler**          | `services/scheduler.py`         | APScheduler hourly job for upcoming event reminders    |
| **Flyer Generator**    | `services/flyer_generator.py`   | In-memory PDF generation with 3 poster styles          |
| **Geocoding**          | `services/geocoding.py`         | OpenStreetMap Nominatim address resolution             |
| **Calendar**           | `services/calendar.py`          | Google Calendar URL builder + .ics file generation     |
| **Event Normalization**| `services/event_normalization.py`| Flexible date/time parsing from natural language       |

---

## Testing

### Backend (pytest)

```bash
cd backend
source venv/bin/activate
pytest --cov=. --cov-report=term-missing -v
```

17 test modules cover auth, campaigns, chat, agent, feed, tasks, impact, leaderboard, promotions, flyers, rewards, and admin map endpoints. Tests use dependency-injected mocks (no real database calls).

### Frontend (Playwright E2E)

```bash
cd frontend
npm run dev                     # start dev server in another terminal
npx playwright test
```

E2E specs cover landing page, auth flow, admin login, and unauthenticated redirect guards.

---

## Deployment

### Frontend (Vercel)

The frontend is deployed on Vercel. The `.vercelignore` excludes test files. Set the environment variables in the Vercel dashboard.

### Backend

Deploy the FastAPI backend to any Python-capable host (Render, Railway, EC2, etc.):

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Ensure all environment variables from `backend/.env` are set in your host's config.

---

## Contributing

1. Fork the repo and create a feature branch.
2. Follow existing code style — backend uses Python type hints and Pydantic v2; frontend uses TypeScript.
3. Write tests for new endpoints (`backend/tests/`) and new pages (`frontend/e2e/`).
4. Open a PR against `main`.

---

Built with care by **TrackATeam4** for the Lemontree community.
