# Admin & Food Pantry — Feature Guide

> This document covers the two dashboards outside the core volunteer flow:
> 1. **Lemontree Admin Dashboard** — staff visibility and oversight
> 2. **Food Pantry Dashboard** — pantries register and link to campaigns

---

## 1. Lemontree Admin Dashboard

### Who uses it
Lemontree staff with `role = 'admin'` in the users table.
Admin accounts are created manually (or seeded) — not self-serve.

### Access Control
All `/admin/*` routes enforce `role = 'admin'` server-side.
Frontend must also gate these routes — redirect non-admins to `/`.

---

### Analytics Overview

```
GET /admin/analytics/overview
```

Returns aggregate platform stats. Use for the top-of-page KPI cards.

```json
{
  "total_campaigns": 42,
  "active_campaigns": 5,
  "completed_campaigns": 30,
  "total_volunteers": 188,
  "total_flyers_distributed": 12400,
  "total_families_reached": 3200,
  "campaigns_this_month": 8,
  "new_volunteers_this_month": 34
}
```

---

### Trends Over Time

```
GET /admin/analytics/trends?period=weekly|monthly
```

Returns time-series data for charts (line/bar).

```json
{
  "labels": ["2026-01-01", "2026-01-08", "2026-01-15"],
  "campaigns_created": [2, 4, 3],
  "signups": [12, 28, 19],
  "flyers_distributed": [400, 1100, 750]
}
```

---

### Impact Heatmap

```
GET /admin/analytics/impact-map?start=2026-01-01&end=2026-03-31
```

Returns geo-clustered data for a heatmap overlay on the map view.

```json
{
  "points": [
    { "latitude": 41.8781, "longitude": -87.6298, "weight": 430 },
    { "latitude": 41.7943, "longitude": -87.5907, "weight": 210 }
  ]
}
```

`weight` = total flyers distributed near that coordinate.

---

### Campaign Management

```
GET  /admin/campaigns                        All campaigns (filterable)
     ?status=published|completed|cancelled
     &date_from=YYYY-MM-DD
     &date_to=YYYY-MM-DD
     &organizer_id=uuid

GET  /admin/campaigns/{id}                   Full campaign detail including signups + impact

PUT  /admin/campaigns/{id}/status
     Body: { "status": "cancelled" }         Manually override status
```

Campaign detail includes:
- All organizer info
- Full signup list with volunteer names
- Impact report (if submitted)
- Linked food pantry (if any)
- Flyer download URL

---

### User Management

```
GET  /admin/users
     ?role=volunteer|admin
     &sort=points|created_at
     &limit=50&page=1
```

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "volunteer",
      "total_points": 340,
      "level": { "level": 4, "name": "Branch" },
      "campaigns_organized": 3,
      "campaigns_attended": 12,
      "joined": "2026-01-15"
    }
  ]
}
```

---

### Flyer Template Management

Lemontree staff controls which templates volunteers can use.

```
GET    /admin/flyer-templates             List all (including inactive)
POST   /admin/flyer-templates             Upload new template
PUT    /admin/flyer-templates/{id}        Update name, fields, active status
DELETE /admin/flyer-templates/{id}        Deactivate (soft delete)
```

**POST /admin/flyer-templates — Request (multipart/form-data):**
```
file:                 <PDF file>
thumbnail:            <PNG/JPG file>
name:                 "Spring 2026 Flyer"
customizable_fields:  {"event_name": true, "date": true, "location": true, "logo": false}
```

`customizable_fields` is a JSON allowlist — only fields set to `true` can be edited by volunteers. Brand elements (`logo`, `tagline`, core messaging) should be `false`.

---

### Food Pantry Verification

```
GET /admin/food-pantries                    All pantries (including unverified)
PUT /admin/food-pantries/{id}/verify        { "is_verified": true }
```

Unverified pantries still show publicly but get a "Unverified" badge on the map.
Verified pantries get a checkmark and rank higher in suggestions.

---

## 2. Food Pantry Dashboard

### Who uses it
Representatives of food pantries — they register with a separate flow and get a pantry-owner role implicitly (stored as the `owner_id` on the food_pantry record).

---

### Registration Flow

```
POST /pantry/register
```

This is a combined endpoint — creates a user account AND a food pantry record in one call.

**Request body:**
```json
{
  "owner_name": "Maria Lopez",
  "email": "maria@hydeparkcares.org",
  "password": "securepassword",
  "pantry_name": "Hyde Park Community Pantry",
  "description": "Serving families every Tuesday and Thursday",
  "address": "5432 S Woodlawn Ave, Chicago, IL 60615",
  "latitude": 41.7950,
  "longitude": -87.5976,
  "phone": "773-555-0100",
  "website": "https://hydeparkcares.org",
  "hours": {
    "monday": "closed",
    "tuesday": "10am-2pm",
    "wednesday": "closed",
    "thursday": "10am-2pm",
    "friday": "closed",
    "saturday": "9am-12pm",
    "sunday": "closed"
  },
  "services": ["produce", "canned_goods", "diapers", "formula"]
}
```

Response includes Supabase session token for immediate login.

---

### Pantry Owner Dashboard

```
GET  /pantry/me                      My pantry profile
PUT  /pantry/me                      Update any field
GET  /pantry/me/campaigns            Volunteer campaigns linked to my pantry
POST /pantry/me/campaigns/{id}/link  Link an existing campaign (by campaign ID)
```

**Updating profile:**
```json
// PUT /pantry/me — partial updates supported
{
  "hours": { "saturday": "8am-1pm" },
  "services": ["produce", "canned_goods", "diapers", "formula", "baby_clothing"]
}
```

---

### Public Pantry Pages (no auth)

```
GET /pantries                        All verified + unverified pantries (public list)
GET /pantries/{id}                   Single pantry detail
```

**Pantry detail response:**
```json
{
  "id": "uuid",
  "name": "Hyde Park Community Pantry",
  "description": "Serving families every Tuesday and Thursday",
  "address": "5432 S Woodlawn Ave",
  "latitude": 41.7950,
  "longitude": -87.5976,
  "phone": "773-555-0100",
  "website": "https://hydeparkcares.org",
  "hours": { "tuesday": "10am-2pm", "thursday": "10am-2pm", "saturday": "9am-12pm" },
  "services": ["produce", "canned_goods", "diapers", "formula"],
  "is_verified": true,
  "linked_campaigns": [
    {
      "id": "uuid",
      "title": "Hyde Park Flyering",
      "date": "2026-03-21",
      "status": "published"
    }
  ]
}
```

---

## Services Taxonomy

Use a fixed list so data stays clean and filterable:

```python
VALID_SERVICES = [
    "produce",
    "canned_goods",
    "dairy",
    "bread",
    "meat",
    "diapers",
    "formula",
    "baby_clothing",
    "personal_care",
    "household",
    "halal",
    "kosher",
    "gluten_free",
    "prepared_meals",
]
```

Validate against this list on `POST /pantry/register` and `PUT /pantry/me`.

---

## Lemontree API Integration Note

The Lemontree API (from the provided PDF) can be used to sync or cross-reference
existing food pantry data. Suggested approach:

1. Build our own pantry registration first (above).
2. Add a background job that pulls pantry data from the Lemontree API periodically.
3. Match records by address/name and link them (add `lemontree_pantry_id` column).
4. This way our app works standalone AND stays synced with Lemontree's data.

```sql
-- Migration to add Lemontree sync field
ALTER TABLE food_pantries ADD COLUMN lemontree_pantry_id VARCHAR(100) UNIQUE;
ALTER TABLE food_pantries ADD COLUMN last_synced_at TIMESTAMP WITH TIME ZONE;
```
