# Frontend Team — Integration Guide

> Next.js 16 + TypeScript + TailwindCSS.
> Backend runs on `http://localhost:8000`.
> Auth: Supabase (already set up — use `frontend/src/lib/auth.ts`).

---

## Auth Pattern

All protected API calls must include the Supabase session token:

```typescript
import { createClient } from '@/lib/supabase'

async function authFetch(path: string, options: RequestInit = {}) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? 'Request failed')
  }

  return res.json()
}
```

---

## Standard API Response Shapes

Every endpoint returns one of these:

```typescript
// Success
interface ApiResponse<T> {
  success: true
  data: T
}

// Paginated
interface PaginatedResponse<T> {
  success: true
  data: T[]
  meta: { total: number; page: number; limit: number }
}

// Error
interface ErrorResponse {
  success: false
  error: string
  code: string
}
```

---

## Pages & What to Call

### `/feed` — Volunteer Home Feed

```typescript
// Personalized ranked events (requires auth + location permission)
GET /feed?lat={lat}&lng={lng}

// Response: PaginatedResponse<Campaign>
```

```typescript
// Trending events (no auth needed)
GET /feed/trending

// Nearby only
GET /feed/nearby?lat={lat}&lng={lng}&radius_km=10
```

**Campaign shape:**
```typescript
interface Campaign {
  id: string
  title: string
  description: string | null
  location: string
  address: string
  latitude: number
  longitude: number
  date: string          // "YYYY-MM-DD"
  start_time: string    // "HH:MM"
  end_time: string      // "HH:MM"
  status: 'draft' | 'published' | 'completed' | 'cancelled'
  max_volunteers: number | null
  target_flyers: number
  signup_count: number
  organizer: { id: string; name: string }
  flyer_template_id: string | null
  food_pantry_id: string | null
  tags: string[]
  promoted_until: string | null
  created_at: string
}
```

---

### `/map` — Event Map

Use Google Maps or Mapbox. Fetch lightweight pin data only.

```typescript
// Map pins — DO NOT use /feed here, it's too heavy
GET /map/campaigns?lat={lat}&lng={lng}&radius_km=20&status=published

// Response
interface MapPin {
  id: string
  title: string
  latitude: number
  longitude: number
  date: string
  signup_count: number
  max_volunteers: number | null
  status: string
}

// Food pantry pins
GET /map/food-pantries?lat={lat}&lng={lng}&radius_km=20
```

**Tip:** Only fetch pins when the map viewport changes, not on every render.

---

### `/campaigns/[id]` — Campaign Detail

```typescript
GET /campaigns/{id}                     // public detail
POST /campaigns/{id}/signup             // sign up (auth)
DELETE /campaigns/{id}/signup           // withdraw (auth)
GET /campaigns/{id}/tasks               // task list
POST /tasks/{id}/assign                 // self-assign a task (auth)
```

---

### `/campaigns/new` — Create Event (via Chatbot)

The chatbot handles event creation — just render the chat UI.
See Chatbot section below.

Fallback manual form calls:
```typescript
POST /campaigns
Body: {
  title, description, location, address,
  latitude, longitude, date, start_time, end_time,
  max_volunteers, target_flyers, flyer_template_id, tags
}
```

---

### `/invite/[token]` — RSVP Page (already built)

> This page is already implemented at `frontend/src/app/invite/[token]/page.tsx`.
> You don't need to build it — just make sure your sign-in page accepts a `?redirect=` query param so unauthenticated users are returned here after login.

**Flow:**
1. Organizer sends an invite → backend emails the volunteer a link like `http://localhost:3000/invite/{token}`
2. Volunteer clicks link → page loads, checks auth → redirects to sign-in if not logged in
3. After sign-in, volunteer sees campaign details + Yes/No buttons
4. Accepting creates a signup + sends a confirmation email with `.ics` attachment
5. After accepting, an **Add to Google Calendar** button appears

**Reusable component — use this anywhere you want a Google Calendar button:**
```typescript
import { AddToCalendarButton } from '@/components/AddToCalendarButton'

// Usage
<AddToCalendarButton url={googleCalendarUrl} />
// or with custom class
<AddToCalendarButton url={googleCalendarUrl} className="w-full justify-center" />
```

---

### Invitations & RSVP — API Reference

All endpoints require auth (`Authorization: Bearer <token>`).

#### Send an invitation (organizer only)

```typescript
// POST /campaigns/{id}/invitations
const result = await authFetch(`/campaigns/${campaignId}/invitations`, {
  method: 'POST',
  body: JSON.stringify({ email: 'volunteer@example.com' }),
})

// Response
interface SendInviteResponse {
  success: true
  data: {
    id: string
    campaign_id: string
    email: string
    token: string
    status: 'pending'
    expires_at: string
    invite_url: string   // ← shareable link: localhost:3000/invite/{token}
    created_at: string
  }
}
```

Use `data.invite_url` to copy/share the invite link directly in the UI, or just let the email do it.

---

#### List invitations for a campaign (organizer only)

```typescript
// GET /campaigns/{id}/invitations
const result = await authFetch(`/campaigns/${campaignId}/invitations`)

// Response: array of invitations
interface Invitation {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'expired'
  created_at: string
  expires_at: string
}
// result.data: Invitation[]
```

Use this to render an invite tracker table in the organizer dashboard — who was invited, who accepted, whose invite expired.

---

#### Load invite page data (volunteer — called by the RSVP page automatically)

```typescript
// GET /invitations/{token}
const result = await authFetch(`/invitations/${token}`)

// Response
interface InvitePageData {
  invitation: { id: string; status: string; email: string }
  campaign: Campaign      // full campaign object
  google_calendar_url: string   // pre-filled Google Calendar link
}
```

**Status 410** means the invite has expired — show an "This invitation has expired" message.

---

#### Accept an invitation

```typescript
// POST /invitations/{token}/accept
const result = await authFetch(`/invitations/${token}/accept`, { method: 'POST' })

// Response
interface AcceptResponse {
  success: true
  data: {
    signup: { id: string; status: 'pending'; campaign_id: string; user_id: string }
    google_calendar_url: string
  }
}
```

After accepting:
- A signup row is created for the volunteer
- A confirmation email with `.ics` is sent to the volunteer automatically
- Use `data.google_calendar_url` to show the Add to Calendar button

**Error 403** — logged-in user's email doesn't match the invite email. Show: *"This invitation was sent to a different email address."*

---

#### Decline an invitation

```typescript
// POST /invitations/{token}/decline
await authFetch(`/invitations/${token}/decline`, { method: 'POST' })
// Response: { success: true, data: { message: 'Invitation declined' } }
```

---

#### Download .ics calendar file

```typescript
// GET /invitations/{token}/calendar.ics
// Returns: text/calendar file download (Content-Disposition: attachment)

// To trigger browser download:
window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/invitations/${token}/calendar.ics`
// Note: this endpoint requires auth — won't work as a plain <a href>
// Use a button that calls authFetch with blob response instead:

const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/invitations/${token}/calendar.ics`, {
  headers: { Authorization: `Bearer ${session.access_token}` },
})
const blob = await res.blob()
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'invite.ics'
a.click()
URL.revokeObjectURL(url)
```

---

### Where to add Invitations UI

| Page | What to add |
|------|------------|
| Campaign detail (`/campaigns/[id]`) | "Send Invite" button (organizer only) — opens a modal with an email input that calls `POST /campaigns/{id}/invitations` |
| Organizer dashboard (`/my/campaigns`) | Invite list per campaign — calls `GET /campaigns/{id}/invitations`, shows status badges (Pending / Accepted / Expired) |
| After signup confirmation | `<AddToCalendarButton url={googleCalendarUrl} />` |
| Confirmation email (auto-sent) | Already handled by backend — volunteer gets email + `.ics` automatically on accept |

---

### `/my/campaigns` — Organizer Dashboard

```typescript
GET /campaigns/mine      // campaigns I created
GET /campaigns/joined    // campaigns I signed up for
```

Organizer actions:
```typescript
PUT  /campaigns/{id}                       // edit campaign
POST /campaigns/{id}/promote               // boost (one-time)
POST /campaigns/{id}/confirm/{user_id}     // mark volunteer attended
POST /campaigns/{id}/impact                // submit report
```

---

### `/leaderboard` — Leaderboard Page

```typescript
GET /leaderboard?scope=global&period=monthly
GET /leaderboard/nearby?lat={lat}&lng={lng}&radius_km=20

// Response
interface LeaderboardEntry {
  rank: number
  user: { id: string; name: string }
  total_points: number
  level: { level: number; name: string }
  badge_count: number
}
```

---

### `/profile` — My Rewards

```typescript
GET /me/points
// Response: { total: 240, transactions: [{ action, points, campaign_title, awarded_at }] }

GET /me/badges
// Response: { badges: [{ slug, awarded_at }] }

GET /me/level
// Response: { level: 3, name: "Bloom", progress_pct: 62 }
```

**Badge slug → display name mapping** (do this in frontend):
```typescript
const BADGE_LABELS: Record<string, { label: string; icon: string }> = {
  first_event:   { label: "First Step",        icon: "🌱" },
  organizer:     { label: "Organizer",          icon: "📋" },
  "5_events":    { label: "Dedicated",          icon: "⭐" },
  recruiter:     { label: "Recruiter",          icon: "🤝" },
  streak_3:      { label: "3-Month Streak",     icon: "🔥" },
  impact_100:    { label: "100 Flyers Out",     icon: "📬" },
  early_adopter: { label: "Early Adopter",      icon: "🚀" },
}
```

---

### `/chat` — AI Chatbot UI

```typescript
// 1. Start session (on page load or first message)
POST /chat/session
// → { session_id: string }

// 2. Send message
POST /chat/message
Body: { session_id: string; message: string }
// → { reply: string; context: object; action: Action | null }

// Action types
type Action =
  | { type: 'campaign_created'; campaign_id: string; flyer_url: string }
  | null

// 3. Restore history (on page refresh)
GET /chat/session/{session_id}
// → { messages: { role: 'user'|'assistant'; content: string }[]; context: object }
```

**Streaming** (if backend supports it — check with AI team):
```typescript
const source = new EventSource(`/api/chat/stream?session_id=${sessionId}`)
source.onmessage = (e) => appendToken(e.data)
```

---

### `/admin/*` — Admin Dashboard (Lemontree staff only)

Only render for users with `role === 'admin'`. Redirect others.

```typescript
GET /admin/analytics/overview
// → { total_campaigns, total_volunteers, total_flyers_distributed, total_families_reached, ... }

GET /admin/analytics/trends?period=weekly
// → { labels: string[]; campaigns: number[]; signups: number[]; flyers: number[] }

GET /admin/campaigns?status=published&date_from=&date_to=
GET /admin/campaigns/{id}
PUT /admin/campaigns/{id}/status       Body: { status: "cancelled" }
```

---

### `/pantry/*` — Food Pantry Dashboard

```typescript
// Registration
POST /pantry/register
Body: {
  name, description, address, latitude, longitude,
  phone, website, hours, services,
  // user fields:
  email, password, owner_name
}

// Owner dashboard
GET  /pantry/me
PUT  /pantry/me
GET  /pantry/me/campaigns
POST /pantry/me/campaigns/{id}/link

// Public
GET /pantries
GET /pantries/{id}
```

**Food pantry shape:**
```typescript
interface FoodPantry {
  id: string
  name: string
  description: string | null
  address: string
  latitude: number
  longitude: number
  phone: string | null
  website: string | null
  hours: Record<string, string> | null   // { monday: "9am-5pm", ... }
  services: string[]
  is_verified: boolean
}
```

---

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...     # or Mapbox token
```

---

## Important: What NOT to Do

- **Don't store user tokens in localStorage** — Supabase handles this via cookies.
- **Don't call `/feed` for the map** — use `/map/campaigns` (much lighter payload).
- **Don't call the Supabase DB directly from frontend** — go through the FastAPI backend.
- **Don't show admin routes to non-admin users** — check `user.role === 'admin'` from the session.
- **Don't hardcode the API URL** — always use `process.env.NEXT_PUBLIC_API_URL`.
