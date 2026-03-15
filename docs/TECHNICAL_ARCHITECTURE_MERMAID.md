# TrackATeam4 - Technical Architecture Documentation

> **Note:** This document uses Mermaid diagrams which render automatically on GitHub.

---

## System Architecture Overview

```mermaid
flowchart TB
    subgraph Presentation["🖥️ PRESENTATION LAYER"]
        direction TB
        FE["Next.js 16 + React 19"]
        FE --> Pages["Landing | Auth | Home | Chat | Discover"]
        FE --> Pages2["Profile | Leaderboard | Invite | Food Pantry"]
        FE --> Tech["TypeScript • TailwindCSS 4 • Framer Motion • Mapbox GL"]
    end

    subgraph API["⚡ API GATEWAY LAYER"]
        direction TB
        FastAPI["FastAPI Backend (Python 3.11+)"]
        CORS["CORS Middleware"]
        JWT["JWT Auth Middleware"]
        Routers["Routers: Auth | Campaign | Chat | Feed | Impact | Map | Tasks | Invite | Leaderboard | Bsky"]
        FastAPI --> CORS --> JWT --> Routers
    end

    subgraph Services["🔧 SERVICE LAYER"]
        direction LR
        subgraph AI["AI/Agent Layer"]
            LangGraph["LangGraph Orchestrator"]
            Bedrock["AWS Bedrock Nova Pro"]
            LangGraph <--> Bedrock
        end
        subgraph Data["Data Access"]
            Supabase["Supabase Client"]
            PG["PostgreSQL + RLS"]
            Supabase --> PG
        end
        subgraph External["External Services"]
            Bsky["Bluesky API"]
            Email["Resend Email"]
            Geo["OpenStreetMap"]
            DDG["DuckDuckGo Search"]
        end
    end

    subgraph DB["💾 PERSISTENCE LAYER"]
        direction TB
        Tables["users | campaigns | signups | tasks | invitations"]
        ChatTables["chat_sessions | chat_messages"]
        GameTables["user_points | user_badges | user_interests"]
        ContentTables["food_pantries | flyer_templates | campaign_flyers | impact_reports"]
    end

    Presentation -->|"HTTPS/REST"| API
    API --> Services
    Services --> DB
```

---

## LangGraph Agent Architecture (3-Node Graph)

```mermaid
flowchart TD
    START((START)) --> call_model

    subgraph call_model["🤖 Node 1: call_model"]
        CM["Call AWS Bedrock Nova Pro<br/>with conversation + tools"]
    end

    call_model --> Router{{"🔀 Router"}}

    Router -->|"campaign tools"| campaign_tools
    Router -->|"web_search"| web_search
    Router -->|"no tools"| END_NODE((END))

    subgraph campaign_tools["🛠️ Node 2: campaign_tools"]
        CT["Execute campaign tools:<br/>save_event_field, create_campaign,<br/>generate_flyer, etc."]
    end

    subgraph web_search["🔍 Node 3: web_search"]
        WS["Execute DuckDuckGo search<br/>for general questions"]
    end

    campaign_tools -->|"loop back"| call_model
    web_search -->|"loop back"| call_model

    style START fill:#22c55e,color:#fff
    style END_NODE fill:#ef4444,color:#fff
    style call_model fill:#3b82f6,color:#fff
    style campaign_tools fill:#8b5cf6,color:#fff
    style web_search fill:#f59e0b,color:#fff
```

---

## User Authentication Flow

```mermaid
sequenceDiagram
    participant User as 👤 User Browser
    participant Next as Next.js Frontend
    participant Supa as Supabase Auth
    participant PG as PostgreSQL
    participant API as FastAPI Backend

    User->>Next: Login Request
    Next->>Supa: signInWithPassword()
    Supa->>PG: Verify credentials
    PG-->>Supa: User record
    Supa-->>Next: JWT Token + Session
    Next-->>User: Store token

    User->>Next: Access protected page
    Next->>API: API Request + Bearer Token
    API->>API: Verify JWT (get_current_user)
    API-->>Next: Protected data
    Next-->>User: Render page
```

---

## AI Campaign Creation Flow

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Chat as Chat UI
    participant API as /chat/message
    participant Graph as LangGraph Agent
    participant Bedrock as AWS Bedrock
    participant Tools as Campaign Tools
    participant DB as Supabase DB

    User->>Chat: "Create a campaign called Spring Food Drive"
    Chat->>API: POST /chat/message
    API->>Graph: run_agent(messages)
    
    loop Tool Execution Loop
        Graph->>Bedrock: Send messages + tool definitions
        Bedrock-->>Graph: Tool call: save_event_field
        Graph->>Tools: Execute save_event_field
        Tools->>DB: Update session context
        DB-->>Tools: Success
        Tools-->>Graph: Tool result
    end

    Graph->>Bedrock: Final response
    Bedrock-->>Graph: "Got it - title saved!"
    Graph-->>API: Response
    API-->>Chat: Reply + context
    Chat-->>User: Display message
```

---

## Database Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o{ campaigns : "organizes"
    users ||--o{ signups : "signs up for"
    users ||--o{ chat_sessions : "owns"
    users ||--o{ user_points : "earns"
    users ||--o{ user_badges : "receives"
    users ||--o{ invitations : "sends"
    
    campaigns ||--o{ signups : "has"
    campaigns ||--o{ tasks : "contains"
    campaigns ||--o{ invitations : "has"
    campaigns ||--o{ impact_reports : "has"
    campaigns }o--|| food_pantries : "linked to"
    campaigns }o--|| flyer_templates : "uses"
    
    chat_sessions ||--o{ chat_messages : "contains"
    
    tasks }o--|| users : "assigned to"
    signups }o--|| tasks : "for"

    users {
        uuid id PK
        string email UK
        string name
        enum role
        timestamp created_at
    }

    campaigns {
        uuid id PK
        uuid organizer_id FK
        string title
        text description
        string location
        string address
        numeric latitude
        numeric longitude
        date date
        time start_time
        time end_time
        enum status
        int max_volunteers
        int target_flyers
        uuid food_pantry_id FK
        array tags
    }

    signups {
        uuid id PK
        uuid campaign_id FK
        uuid user_id FK
        enum status
        uuid task_id FK
        timestamp joined_at
    }

    chat_sessions {
        uuid id PK
        uuid user_id FK
        string status
        jsonb context
        timestamp created_at
    }

    chat_messages {
        uuid id PK
        uuid session_id FK
        string role
        text content
        timestamp created_at
    }

    user_points {
        uuid id PK
        uuid user_id FK
        uuid campaign_id FK
        string action
        int points
        timestamp awarded_at
    }

    food_pantries {
        uuid id PK
        uuid owner_id FK
        string name
        string address
        numeric latitude
        numeric longitude
        array services
        boolean is_verified
    }
```

---

## AI Tools Architecture

```mermaid
flowchart LR
    subgraph Collection["📝 Data Collection"]
        save["save_event_field"]
    end

    subgraph Validation["✅ Validation"]
        conflicts["check_conflicts"]
        pantries["suggest_nearby_pantries"]
    end

    subgraph Creation["🎯 Creation"]
        create["create_campaign"]
        flyer["generate_flyer"]
    end

    subgraph Social["📢 Social"]
        bsky["post_campaign_to_bluesky"]
    end

    subgraph Communication["📧 Communication"]
        invite["send_campaign_invite"]
        bulk["send_bulk_invites"]
        list["list_campaign_invitations"]
    end

    subgraph Utility["🔧 Utility"]
        reset["reset_session"]
        calendar["get_campaign_calendar_url"]
        signups["get_campaign_signups"]
    end

    User((User)) --> Collection
    Collection --> Validation
    Validation --> Creation
    Creation --> Social
    Creation --> Communication
    Social --> Utility

    style Collection fill:#22c55e,color:#fff
    style Validation fill:#3b82f6,color:#fff
    style Creation fill:#8b5cf6,color:#fff
    style Social fill:#ec4899,color:#fff
    style Communication fill:#f59e0b,color:#fff
    style Utility fill:#6b7280,color:#fff
```

---

## Security Architecture

```mermaid
flowchart TB
    subgraph Layer1["🔐 Layer 1: Authentication"]
        Auth["Supabase Auth"]
        Email["Email/Password"]
        OAuth["Google OAuth 2.0"]
        JWT["JWT Tokens"]
        Auth --> Email & OAuth --> JWT
    end

    subgraph Layer2["🛡️ Layer 2: Authorization"]
        RLS["Row Level Security"]
        Ownership["Session Ownership Check"]
        OrgOnly["Organizer-Only Endpoints"]
    end

    subgraph Layer3["🔒 Layer 3: API Security"]
        CORS["CORS Whitelist"]
        Bearer["Bearer Token Required"]
        Pydantic["Pydantic Validation"]
        UUID["UUID Pattern Validation"]
    end

    subgraph Layer4["🗝️ Layer 4: Environment"]
        Env[".env Files"]
        AWS["AWS Bearer Token"]
        Keys["Separated Supabase Keys"]
    end

    Request((Request)) --> Layer1
    Layer1 --> Layer2
    Layer2 --> Layer3
    Layer3 --> Layer4
    Layer4 --> Protected((Protected Resource))

    style Layer1 fill:#22c55e,color:#fff
    style Layer2 fill:#3b82f6,color:#fff
    style Layer3 fill:#8b5cf6,color:#fff
    style Layer4 fill:#f59e0b,color:#fff
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

## Available AI Tools (12 Tools)

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

## Deployment Architecture

```mermaid
flowchart LR
    subgraph Dev["Development Environment"]
        FE["Next.js<br/>localhost:3000"]
        BE["FastAPI<br/>localhost:8000"]
        FE <-->|CORS| BE
    end

    subgraph Cloud["Cloud Services"]
        Supa["Supabase Cloud<br/>PostgreSQL + Auth"]
        Bedrock["AWS Bedrock<br/>us-east-1"]
    end

    BE --> Supa
    BE --> Bedrock

    style FE fill:#22c55e,color:#fff
    style BE fill:#3b82f6,color:#fff
    style Supa fill:#8b5cf6,color:#fff
    style Bedrock fill:#f59e0b,color:#fff
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
