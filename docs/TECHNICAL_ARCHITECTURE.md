# TrackATeam4 - Technical Architecture Documentation

## CALM Architecture Overview (Common Architecture Language Model)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TRACKA TEAM PLATFORM                                │
│                     Volunteer Campaign Coordination System                       │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 PRESENTATION LAYER                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         Next.js 16 Frontend (React 19)                   │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │    │
│  │  │  Landing │ │   Auth   │ │   Home   │ │  Chat    │ │ Discover │       │    │
│  │  │   Page   │ │  Pages   │ │Dashboard │ │   AI     │ │   Map    │       │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                    │    │
│  │  │  Profile │ │Leaderboard│ │  Invite │ │Food Pantry│                   │    │
│  │  │   Page   │ │   Page   │ │  Accept  │ │   View   │                    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘                    │    │
│  │                                                                          │    │
│  │  Tech: TypeScript • TailwindCSS 4 • Framer Motion • Mapbox GL           │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS/REST API
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  API GATEWAY LAYER                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                      FastAPI Backend (Python 3.11+)                      │    │
│  │                                                                          │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │    │
│  │  │                         CORS Middleware                          │    │    │
│  │  │              (localhost:3000 ↔ localhost:8000)                   │    │    │
│  │  └─────────────────────────────────────────────────────────────────┘    │    │
│  │                                                                          │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │    │
│  │  │                      JWT Auth Middleware                         │    │    │
│  │  │                  (Supabase Token Verification)                   │    │    │
│  │  └─────────────────────────────────────────────────────────────────┘    │    │
│  │                                                                          │    │
│  │  Routers:                                                                │    │
│  │  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐          │    │
│  │  │  Auth  ││Campaign││  Chat  ││  Feed  ││ Impact ││  Map   │          │    │
│  │  └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘          │    │
│  │  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐          │    │
│  │  │ Tasks  ││Invite  ││Leader- ││Promote ││  Bsky  ││Scheduler│         │    │
│  │  │        ││        ││ board  ││        ││        ││         │         │    │
│  │  └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│    AI/AGENT LAYER     │ │    DATA ACCESS LAYER  │ │  EXTERNAL SERVICES    │
│                       │ │                       │ │                       │
│ ┌───────────────────┐ │ │ ┌───────────────────┐ │ │ ┌───────────────────┐ │
│ │   LangGraph       │ │ │ │  Supabase Client  │ │ │ │   Bluesky API     │ │
│ │   Orchestrator    │ │ │ │                   │ │ │ │   (AT Protocol)   │ │
│ │                   │ │ │ │  - PostgreSQL     │ │ │ └───────────────────┘ │
│ │ ┌───────────────┐ │ │ │ │  - Row Level Sec  │ │ │ ┌───────────────────┐ │
│ │ │  call_model   │ │ │ │ │  - Realtime       │ │ │ │   Resend Email    │ │
│ │ │    (Node 1)   │ │ │ │ │  - Storage        │ │ │ │   Service         │ │
│ │ └───────┬───────┘ │ │ │ └───────────────────┘ │ │ └───────────────────┘ │
│ │         │         │ │ │                       │ │ ┌───────────────────┐ │
│ │    ┌────┴────┐    │ │ │                       │ │ │   OpenStreetMap   │ │
│ │    ▼         ▼    │ │ │                       │ │ │   Geocoding       │ │
│ │ ┌──────┐ ┌──────┐ │ │ │                       │ │ └───────────────────┘ │
│ │ │camp- │ │ web  │ │ │ │                       │ │ ┌───────────────────┐ │
│ │ │aign_ │ │search│ │ │ │                       │ │ │   DuckDuckGo      │ │
│ │ │tools │ │(DDG) │ │ │ │                       │ │ │   Web Search      │ │
│ │ │(N 2) │ │(N 3) │ │ │ │                       │ │ └───────────────────┘ │
│ │ └──────┘ └──────┘ │ │ │                       │ │                       │
│ └───────────────────┘ │ │                       │ │                       │
│                       │ │                       │ │                       │
│ ┌───────────────────┐ │ │                       │ │                       │
│ │  AWS Bedrock      │ │ │                       │ │                       │
│ │  Nova Pro v1      │ │ │                       │ │                       │
│ │  (LLM Engine)     │ │ │                       │ │                       │
│ └───────────────────┘ │ │                       │ │                       │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               PERSISTENCE LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                        Supabase (PostgreSQL)                             │    │
│  │                                                                          │    │
│  │  Core Tables:                                                            │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │    │
│  │  │  users  │ │campaigns│ │ signups │ │  tasks  │ │invites  │            │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘            │    │
│  │                                                                          │    │
│  │  AI/Chat Tables:                                                         │    │
│  │  ┌─────────────┐ ┌─────────────┐                                        │    │
│  │  │chat_sessions│ │chat_messages│                                        │    │
│  │  └─────────────┘ └─────────────┘                                        │    │
│  │                                                                          │    │
│  │  Gamification:                                                           │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                        │    │
│  │  │ user_points │ │ user_badges │ │user_interests│                       │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘                        │    │
│  │                                                                          │    │
│  │  Content:                                                                │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │    │
│  │  │food_pantries│ │flyer_templs │ │campaign_flyr│ │impact_report│        │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘        │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Stack Summary

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Frontend** | Next.js | 16.1.6 | React framework with SSR/SSG |
| | React | 19.2.3 | UI component library |
| | TypeScript | 5.x | Type-safe JavaScript |
| | TailwindCSS | 4.x | Utility-first CSS |
| | Framer Motion | 12.36.0 | Animations |
| | Mapbox GL | 3.20.0 | Interactive maps |
| **Backend** | FastAPI | 0.135.1 | Async Python web framework |
| | Uvicorn | 0.41.0 | ASGI server |
| | Pydantic | 2.11.7+ | Data validation |
| **AI/ML** | LangGraph | 0.6.7 | Agent orchestration |
| | LangChain | 0.3.27 | LLM framework |
| | LangChain-AWS | 0.2.35 | Bedrock integration |
| | AWS Bedrock | - | Nova Pro v1 LLM |
| **Database** | Supabase | 2.28.2 | PostgreSQL + Auth + Storage |
| **External** | Resend | 2.0.0+ | Transactional email |
| | AT Protocol | 0.0.65 | Bluesky social posting |
| | FPDF2 | 2.8.3 | PDF flyer generation |

---

## Data Flow Diagrams

### 1. User Authentication Flow
```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User    │───▶│ Next.js  │───▶│ Supabase │───▶│PostgreSQL│
│ Browser  │    │ Frontend │    │   Auth   │    │  users   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     │                │               │
     │                │               │
     │    JWT Token   │◀──────────────┘
     │◀───────────────┘
     │
     │    API Request + Bearer Token
     │─────────────────────────────────────────▶┌──────────┐
                                                │ FastAPI  │
                                                │ Backend  │
                                                └──────────┘
```

### 2. AI Campaign Creation Flow
```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   User   │───▶│  Chat UI │───▶│ /chat/   │───▶│ LangGraph│
│          │    │          │    │ message  │    │  Agent   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                      │
                     ┌────────────────────────────────┤
                     │                                │
                     ▼                                ▼
              ┌──────────┐                     ┌──────────┐
              │  Bedrock │                     │ Campaign │
              │ Nova Pro │                     │  Tools   │
              └──────────┘                     └──────────┘
                     │                                │
                     │    Tool Calls                  │
                     │◀───────────────────────────────┤
                     │                                │
                     │    Tool Results                │
                     │───────────────────────────────▶│
                     │                                │
                     ▼                                ▼
              ┌──────────┐                     ┌──────────┐
              │ Response │                     │ Supabase │
              │ to User  │                     │   DB     │
              └──────────┘                     └──────────┘
```

### 3. LangGraph Agent Architecture (3-Node Graph)
```
                              ┌─────────────┐
                              │   START     │
                              └──────┬──────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │ call_model  │◀──────────────────┐
                              │  (Node 1)   │                   │
                              └──────┬──────┘                   │
                                     │                          │
                              ┌──────┴──────┐                   │
                              │   Router    │                   │
                              └──────┬──────┘                   │
                    ┌────────────────┼────────────────┐         │
                    │                │                │         │
                    ▼                ▼                ▼         │
             ┌───────────┐   ┌───────────┐    ┌───────────┐     │
             │ campaign_ │   │web_search │    │    END    │     │
             │   tools   │   │  (Node 3) │    │           │     │
             │  (Node 2) │   └─────┬─────┘    └───────────┘     │
             └─────┬─────┘         │                            │
                   │               │                            │
                   └───────────────┴────────────────────────────┘
                              (loop back to call_model)
```

---

## Database Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     users       │       │    campaigns    │       │   food_pantries │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK, UUID)   │◀──┐   │ id (PK, UUID)   │   ┌──▶│ id (PK, UUID)   │
│ email (UNIQUE)  │   │   │ organizer_id(FK)│───┘   │ owner_id (FK)   │
│ name            │   │   │ title           │       │ name            │
│ role            │   │   │ description     │       │ address         │
│ created_at      │   │   │ location        │       │ latitude        │
└─────────────────┘   │   │ address         │       │ longitude       │
         │            │   │ latitude        │       │ services[]      │
         │            │   │ longitude       │       │ is_verified     │
         │            │   │ date            │       └─────────────────┘
         │            │   │ start_time      │
         │            │   │ end_time        │
         │            │   │ status          │
         │            │   │ max_volunteers  │
         │            │   │ target_flyers   │
         │            │   │ food_pantry_id  │───────────────────────────┘
         │            │   │ tags[]          │
         │            │   └─────────────────┘
         │            │            │
         │            │            │
         │            │            ▼
         │            │   ┌─────────────────┐       ┌─────────────────┐
         │            │   │    signups      │       │     tasks       │
         │            │   ├─────────────────┤       ├─────────────────┤
         │            └───│ user_id (FK)    │       │ id (PK, UUID)   │
         │                │ campaign_id(FK) │◀──────│ campaign_id(FK) │
         │                │ status          │       │ title           │
         │                │ task_id (FK)    │──────▶│ assigned_to(FK) │
         │                │ joined_at       │       │ max_assignees   │
         │                └─────────────────┘       └─────────────────┘
         │
         │            ┌─────────────────┐       ┌─────────────────┐
         │            │  chat_sessions  │       │  chat_messages  │
         │            ├─────────────────┤       ├─────────────────┤
         └───────────▶│ id (PK, UUID)   │◀──────│ session_id (FK) │
                      │ user_id (FK)    │       │ role            │
                      │ status          │       │ content         │
                      │ context (JSONB) │       │ created_at      │
                      │ created_at      │       └─────────────────┘
                      └─────────────────┘

         ┌─────────────────┐       ┌─────────────────┐
         │   user_points   │       │   user_badges   │
         ├─────────────────┤       ├─────────────────┤
         │ id (PK, UUID)   │       │ id (PK, UUID)   │
         │ user_id (FK)    │       │ user_id (FK)    │
         │ campaign_id(FK) │       │ badge_slug      │
         │ action          │       │ awarded_at      │
         │ points          │       └─────────────────┘
         │ awarded_at      │
         └─────────────────┘

         ┌─────────────────┐       ┌─────────────────┐
         │  invitations    │       │ impact_reports  │
         ├─────────────────┤       ├─────────────────┤
         │ id (PK, UUID)   │       │ id (PK, UUID)   │
         │ campaign_id(FK) │       │ campaign_id(FK) │
         │ invited_by (FK) │       │ submitted_by(FK)│
         │ email           │       │ flyers_distributed│
         │ token (UNIQUE)  │       │ families_reached│
         │ status          │       │ volunteers_attended│
         │ expires_at      │       │ notes           │
         └─────────────────┘       │ photos[]        │
                                   └─────────────────┘
```

---

## AI Integration Architecture

### AWS Bedrock Integration
```
┌─────────────────────────────────────────────────────────────────┐
│                     BEDROCK INTEGRATION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Configuration:                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ BEDROCK_URL = bedrock-runtime.{region}.amazonaws.com       │ │
│  │ MODEL_ID = us.amazon.nova-pro-v1:0                         │ │
│  │ AUTH = Bearer Token (AWS_BEARER_TOKEN_BEDROCK)             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Request Format (Converse API):                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ {                                                          │ │
│  │   "modelId": "us.amazon.nova-pro-v1:0",                    │ │
│  │   "messages": [...],  // Converted to Converse format      │ │
│  │   "system": [{"text": SYSTEM_PROMPT}],                     │ │
│  │   "inferenceConfig": {"maxTokens": 4096, "temperature": 0.3}│ │
│  │   "toolConfig": {"tools": [...]}  // Tool definitions      │ │
│  │ }                                                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Tool Execution Flow:                                            │
│  1. Model receives user message + tool definitions               │
│  2. Model decides which tools to call (if any)                   │
│  3. Backend executes tools via HTTP to internal endpoints        │
│  4. Tool results fed back to model                               │
│  5. Model generates final response                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Available AI Tools (12 Tools)

| Tool | Purpose | When Called |
|------|---------|-------------|
| `save_event_field` | Save campaign field to session | User provides event details |
| `check_conflicts` | Find scheduling conflicts | Before campaign creation |
| `suggest_nearby_pantries` | Find food pantries within 5km | After location is set |
| `create_campaign` | Create campaign from context | All required fields collected |
| `generate_flyer` | Generate PDF flyer | After campaign creation |
| `post_campaign_to_bluesky` | Post to Bluesky social | After campaign creation |
| `reset_session` | Clear session for new campaign | User wants to start fresh |
| `send_campaign_invite` | Email single volunteer | User requests invite |
| `send_bulk_invites` | Email multiple volunteers | User provides email list |
| `list_campaign_invitations` | Show invitation status | User asks about invites |
| `get_campaign_calendar_url` | Generate Google Calendar link | User requests calendar |
| `get_campaign_signups` | List volunteer signups | User asks about signups |

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SECURITY LAYERS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. AUTHENTICATION (Supabase Auth)                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Email/Password authentication                            │ │
│  │ • Google OAuth 2.0 integration                             │ │
│  │ • JWT tokens with automatic refresh                        │ │
│  │ • Email verification required                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  2. AUTHORIZATION (Row Level Security)                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Users can only access their own data                     │ │
│  │ • Organizers can manage their campaigns                    │ │
│  │ • Session ownership verified on every request              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  3. API SECURITY                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • CORS restricted to frontend origin                       │ │
│  │ • Bearer token required for protected endpoints            │ │
│  │ • Input validation via Pydantic models                     │ │
│  │ • UUID pattern validation on path parameters               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  4. ENVIRONMENT SECURITY                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Secrets in .env files (not committed)                    │ │
│  │ • AWS credentials via bearer token                         │ │
│  │ • Supabase keys separated (anon vs service)                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoint Summary

### Public Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API status |
| GET | `/health` | Health check |
| GET | `/campaigns` | List all campaigns |
| GET | `/campaigns/{id}` | Get campaign details |
| GET | `/campaigns/geocode` | Geocode address |
| GET | `/map/food-pantries` | List food pantries |

### Protected Endpoints (Require Auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Register new user |
| POST | `/auth/signin` | Login user |
| GET | `/auth/me` | Get current user |
| POST | `/campaigns` | Create campaign |
| PUT | `/campaigns/{id}` | Update campaign |
| DELETE | `/campaigns/{id}` | Cancel campaign |
| POST | `/campaigns/{id}/signup` | Volunteer signup |
| POST | `/chat/session` | Create chat session |
| POST | `/chat/message` | Send message to AI |
| GET | `/leaderboard` | Get points leaderboard |
| POST | `/bsky/post` | Post to Bluesky |

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT ENVIRONMENT                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Frontend (localhost:3000)          Backend (localhost:8000)     │
│  ┌─────────────────────┐           ┌─────────────────────┐      │
│  │   npm run dev       │◀─────────▶│   uvicorn main:app  │      │
│  │   (Next.js 16)      │   CORS    │   --reload          │      │
│  └─────────────────────┘           └─────────────────────┘      │
│           │                                  │                   │
│           │                                  │                   │
│           ▼                                  ▼                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Supabase Cloud (PostgreSQL)                 │    │
│  │              sqjdyakdugvlkylwkelz.supabase.co           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              AWS Bedrock (us-east-1)                     │    │
│  │              Nova Pro v1 Model                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Performance Considerations

| Component | Strategy |
|-----------|----------|
| **Database** | PostgreSQL indexes on foreign keys, pagination on list endpoints |
| **API** | Async FastAPI handlers, connection pooling via Supabase |
| **AI** | 120s timeout for Bedrock calls, max 8 tool iterations per turn |
| **Frontend** | Next.js SSR/SSG, TailwindCSS for minimal CSS bundle |
| **Chat** | Session history capped at 10 messages to reduce token usage |

---

*Document generated for TrackATeam4 mentor review and judge Q&A preparation.*
