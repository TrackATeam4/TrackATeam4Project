# Invitations, RSVP & Calendar Feature — Frontend Implementation Guide

> **Backend status: fully complete and tested.**
> This doc tells you exactly what endpoints are live, what pages/components to build, and what order to do it in.

---

## What the Backend Does Automatically

You don't need to implement any of this — it's already handled server-side:

| Trigger | What backend does automatically |
|---------|--------------------------------|
| Organizer sends an invite | Emails the volunteer a branded invite with an RSVP link + `.ics` attachment |
| Volunteer accepts RSVP | Creates their signup + emails them a confirmation with `.ics` attachment |
| 24h before a campaign | Emails all confirmed volunteers a reminder |
| 1h before a campaign | Emails all confirmed volunteers a final reminder |

The `.ics` attachment works in Gmail, Outlook, and Apple Mail — it shows up as a native calendar invite.

---

## Important: User Profile Sync

When a user signs in via Supabase (email or Google) and interacts with invitations, the backend **automatically upserts** them into the `users` table using their auth metadata. You do **not** need to manually create a user profile row on signup. This is handled in the accept endpoint.

---

## Backend `.env` Variables (already set)

```
RESEND_API_KEY=...         # email sending
FRONTEND_URL=http://localhost:3000  # used to build RSVP links
```

---

## API Endpoints Reference

Base URL: `http://localhost:8000`

All endpoints require `Authorization: Bearer <supabase_access_token>` except where noted.

### Auth helper (use this for every API call)

```typescript
async function authFetch(path: string, method = 'GET', body?: object) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? ''

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Request failed')
  }
  return res.json()
}
```

---

### 1. Send an invitation

**Who calls this:** Organizer, from the campaign management page.

```
POST /campaigns/{campaign_id}/invitations
Body: { "email": "volunteer@example.com" }
```

```typescript
await authFetch(`/campaigns/${campaignId}/invitations`, 'POST', {
  email: 'volunteer@example.com',
})
```

**Response:**
```typescript
{
  success: true,
  data: {
    id: string
    campaign_id: string
    email: string
    token: string
    status: 'pending'
    expires_at: string       // ISO datetime, 7 days from now
    invite_url: string       // e.g. "http://localhost:3000/invite/{token}"
    created_at: string
  }
}
```

Use `data.invite_url` to show a "Copy link" button alongside the email invite.

**Errors:**
- `403` — caller is not the campaign organizer
- `409` — an active invitation already exists for this email

---

### 2. List invitations for a campaign

**Who calls this:** Organizer, on campaign dashboard to see who was invited.

```
GET /campaigns/{campaign_id}/invitations
```

```typescript
const result = await authFetch(`/campaigns/${campaignId}/invitations`)
// result.data: Invitation[]
```

```typescript
interface Invitation {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'expired'
  created_at: string
  expires_at: string
}
```

---

### 3. Load RSVP page data

**Who calls this:** The `/invite/[token]` page on load.

```
GET /invitations/{token}
```

```typescript
const result = await authFetch(`/invitations/${token}`)
```

**Response:**
```typescript
{
  success: true,
  data: {
    invitation: {
      id: string
      status: 'pending' | 'accepted' | 'expired'
      email: string
    }
    campaign: {
      id: string
      title: string
      description: string | null
      location: string
      address: string
      date: string        // "YYYY-MM-DD"
      start_time: string  // "HH:MM"
      end_time: string    // "HH:MM"
      status: string
      max_volunteers: number | null
      target_flyers: number
      tags: string[]
    }
    google_calendar_url: string  // pre-built, just use as an <a href>
  }
}
```

**Errors:**
- `404` — token doesn't exist
- `410` — invitation has expired (show "This invitation has expired" message)

---

### 4. Accept an invitation

**Who calls this:** Volunteer, clicking "Yes, I'm going" on the RSVP page.

```
POST /invitations/{token}/accept
```

```typescript
const result = await authFetch(`/invitations/${token}/accept`, 'POST')
```

**Response:**
```typescript
{
  success: true,
  data: {
    signup: {
      id: string
      status: 'pending'
      campaign_id: string
      user_id: string
    }
    google_calendar_url: string  // show the Add to Calendar button with this
  }
}
```

After this call:
- The volunteer's signup is created in the DB
- A confirmation email + `.ics` is automatically sent to them — you don't need to do anything

**Errors:**
- `403` — logged-in user's email doesn't match the invitation email → show: *"This invitation was sent to a different email address."*
- `410` — invitation expired

---

### 5. Decline an invitation

**Who calls this:** Volunteer, clicking "No, can't make it".

```
POST /invitations/{token}/decline
```

```typescript
await authFetch(`/invitations/${token}/decline`, 'POST')
```

**Response:** `{ success: true, data: { message: 'Invitation declined' } }`

**Errors:**
- `403` — email mismatch
- `409` — can't decline an already accepted invitation

---

### 6. Download `.ics` file

For cases where the volunteer wants to manually download the calendar file (e.g. for Outlook).

```typescript
// Must use fetch with auth header — can't use a plain <a> tag
const { data } = await supabase.auth.getSession()
const res = await fetch(
  `${process.env.NEXT_PUBLIC_API_URL}/invitations/${token}/calendar.ics`,
  { headers: { Authorization: `Bearer ${data.session?.access_token}` } }
)
const blob = await res.blob()
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'invite.ics'
a.click()
URL.revokeObjectURL(url)
```

---

## Pages to Build

### Page 1: `/invite/[token]` — RSVP Page

**Already scaffolded** at `frontend/src/app/invite/[token]/page.tsx` and `frontend/src/components/AddToCalendarButton.tsx`. You can use or replace these.

**Requirements:**
- Must require auth — if not signed in, redirect to your sign-in page with `?redirect=/invite/{token}`
- On load: call `GET /invitations/{token}`, show campaign info
- If `invitation.status === 'accepted'` on load: skip buttons, show confirmation + Add to Calendar
- If `status === 410 expired`: show expiry message
- Accept button → `POST /invitations/{token}/accept` → show confirmation + `google_calendar_url`
- Decline button → `POST /invitations/{token}/decline` → show declined state
- The `google_calendar_url` from the response is a plain URL — just set it as `href` on a link/button

```
Layout:
┌─────────────────────────────┐
│ [Green header] Campaign title│
├─────────────────────────────┤
│ 📅 March 28, 2026           │
│    10:00 AM – 1:00 PM       │
│ 📍 Downtown Farmers Market  │
│    123 Main St, NY           │
│                              │
│ [Description]                │
├─────────────────────────────┤
│ Will you attend?             │
│ [Yes, I'm going] [Can't make]│
│ [Add to Google Calendar ↗]  │
└─────────────────────────────┘
```

---

### Page 2: Organizer — Send Invite UI

Add to the campaign detail or organizer dashboard. Suggested: a modal or inline form.

**Minimum viable:**
```
┌─────────────────────────────┐
│ Invite a volunteer           │
│ Email: [___________________] │
│ [Send Invite]                │
└─────────────────────────────┘
```

After sending, show the `invite_url` with a copy button so the organizer can also share the link directly.

---

### Page 3: Organizer — Invitation Status List

Add to the organizer dashboard alongside signups. Shows who was invited and their status.

```
┌──────────────────────┬──────────┬───────────┐
│ Email                │ Status   │ Sent       │
├──────────────────────┼──────────┼───────────┤
│ alice@example.com    │ ✅ Accepted│ Mar 14    │
│ bob@example.com      │ ⏳ Pending │ Mar 14    │
│ carol@example.com    │ ❌ Expired │ Mar 10    │
└──────────────────────┴──────────┴───────────┘
```

Status badge colors:
- `pending` → yellow
- `accepted` → green
- `expired` → gray/red

---

## Reusable Component

`frontend/src/components/AddToCalendarButton.tsx` is already built. Import and use anywhere:

```typescript
import { AddToCalendarButton } from '@/components/AddToCalendarButton'

<AddToCalendarButton url={googleCalendarUrl} />
// optional: className prop for layout adjustments
<AddToCalendarButton url={googleCalendarUrl} className="w-full justify-center" />
```

---

## Flow Diagram

```
Organizer                    Backend                      Volunteer
   │                            │                             │
   │  POST /campaigns/{id}/     │                             │
   │  invitations {email}  ───► │  saves invitation           │
   │                            │  sends invite email ──────► │ receives email
   │  ◄── { invite_url }        │  with RSVP link + .ics      │
   │                            │                             │
   │  (optionally copies URL    │                             │ clicks link
   │   and shares directly)     │                             │  ↓
   │                            │                  GET /invitations/{token}
   │                            │ ◄───────────────────────────│
   │                            │ ────────────────────────────► campaign details
   │                            │                             │
   │                            │                  POST /invitations/{token}/accept
   │                            │ ◄───────────────────────────│
   │                            │  creates signup             │
   │                            │  sends confirm email ──────► │ receives .ics
   │                            │ ────────────────────────────► { google_calendar_url }
   │                            │                             │
   │                       [scheduler]                        │
   │                            │  24h before event           │
   │                            │  sends reminder ───────────► │ reminder email
   │                            │  1h before event            │
   │                            │  sends reminder ───────────► │ final reminder
```

---

## Environment Variables Needed (frontend)

No new variables needed. The existing ones cover everything:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
