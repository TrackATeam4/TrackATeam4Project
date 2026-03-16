# Backend Team — API Endpoints & Business Logic

> FastAPI + Supabase (PostgreSQL). Run on `http://localhost:8000`.
> Auth: Supabase JWT passed as `Authorization: Bearer <token>` header.

---

## Auth Middleware

All protected routes require a valid Supabase JWT. Middleware already set up — use the `get_current_user` dependency.

```python
@router.get("/campaigns/mine")
async def my_campaigns(user = Depends(get_current_user)):
    ...
```

Role check helper for admin routes:
```python
def require_admin(user = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
```

---

## 1. Volunteer — Campaign CRUD

```
POST   /campaigns                      Create a new campaign (auth)
GET    /campaigns/{id}                 Campaign detail (public)
PUT    /campaigns/{id}                 Update campaign (organizer only)
DELETE /campaigns/{id}                 Cancel/delete campaign (organizer only)
GET    /campaigns/mine                 Campaigns I created (auth)
GET    /campaigns/joined               Campaigns I signed up for (auth)
```

**POST /campaigns — Request body:**
```json
{
  "title": "Hyde Park Flyering",
  "description": "...",
  "location": "Hyde Park",
  "address": "5100 S Lake Shore Dr",
  "latitude": 41.7943,
  "longitude": -87.5907,
  "date": "2026-03-21",
  "start_time": "10:00",
  "end_time": "13:00",
  "max_volunteers": 10,
  "target_flyers": 500,
  "flyer_template_id": "uuid",
  "food_pantry_id": "uuid | null",
  "tags": ["families", "south_side", "weekend"]
}
```

---

## 2. Signups

```
POST   /campaigns/{id}/signup          Volunteer registers (auth)
DELETE /campaigns/{id}/signup          Volunteer withdraws (auth)
GET    /campaigns/{id}/signups         List signups (organizer only)
POST   /campaigns/{id}/confirm/{uid}   Organizer confirms volunteer attended (auth, organizer)
```

**Attendance confirmation is required for points to be awarded.** The organizer calls `POST /campaigns/{id}/confirm/{uid}` after the event — this triggers the reward logic.

---

## 3. Tasks

```
GET    /campaigns/{id}/tasks           List tasks (public)
POST   /campaigns/{id}/tasks           Create task (organizer)
PUT    /tasks/{id}                     Update/assign task (organizer)
DELETE /tasks/{id}                     Delete task (organizer)
POST   /tasks/{id}/assign              Volunteer self-assigns to a task (auth)
DELETE /tasks/{id}/assign              Volunteer unassigns (auth)
```

---

## 4. Impact Reports

```
POST   /campaigns/{id}/impact          Submit post-event report (organizer)
GET    /campaigns/{id}/impact          Get report (auth)
```

**POST /campaigns/{id}/impact — Request body:**
```json
{
  "flyers_distributed": 430,
  "families_reached": 120,
  "volunteers_attended": 8,
  "notes": "Great turnout near the park entrance.",
  "photos": ["https://storage.supabase.../photo1.jpg"]
}
```

Submitting a report triggers:
1. Award `10 pts` to organizer (`action: 'report'`)
2. Check and award `impact_100` badge if threshold crossed

---

## 5. Feed & Discovery

```
GET  /feed                             Personalized ranked events (auth)
GET  /feed/trending                    Trending events (public)
GET  /feed/nearby?lat=&lng=&radius_km= Events within radius (public)
GET  /campaigns/search?q=&tags=&date_from=&date_to=&lat=&lng=
```

### Recommendation Score Formula

Score each published campaign for the requesting user. Sort descending.

```python
from math import radians, sin, cos, sqrt, atan2

def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

def score_campaign(campaign, user, user_location, user_tags, viewed_ids) -> float:
    # 1. Proximity (40%) — linear decay, 0 score beyond 15km
    dist = haversine_km(user_location.lat, user_location.lng,
                        campaign.latitude, campaign.longitude)
    proximity = max(0.0, 1.0 - dist / 15.0) * 0.40

    # 2. Interest match (25%) — tag overlap ratio
    if campaign.tags and user_tags:
        overlap = len(set(campaign.tags) & set(user_tags))
        interest = (overlap / len(campaign.tags)) * 0.25
    else:
        interest = 0.0

    # 3. Urgency (20%) — peaks at events happening in 1-3 days
    days_away = (campaign.date - date.today()).days
    if days_away < 0:
        urgency = 0.0
    elif days_away <= 3:
        urgency = 1.0 * 0.20
    else:
        urgency = max(0.0, 1.0 - days_away / 14.0) * 0.20

    # 4. Social proof (10%) — % spots filled
    if campaign.max_volunteers:
        fill_rate = min(1.0, campaign.signup_count / campaign.max_volunteers)
    else:
        fill_rate = 0.5
    social = fill_rate * 0.10

    # 5. Novelty (5%) — unseen events rank higher
    novelty = 0.0 if campaign.id in viewed_ids else 0.05

    # Promotion boost — +20% for 24h window
    boost = 0.20 if campaign.promoted_until and campaign.promoted_until > datetime.utcnow() else 0.0

    return proximity + interest + urgency + social + novelty + boost
```

**Trending logic** (`/feed/trending`):
```python
# Events with the most signups in the last 48 hours
SELECT c.*, COUNT(s.id) as recent_signups
FROM campaigns c
JOIN signups s ON s.campaign_id = c.id
WHERE c.status = 'published'
  AND s.joined_at > NOW() - INTERVAL '48 hours'
GROUP BY c.id
ORDER BY recent_signups DESC
LIMIT 10;
```

---

## 6. Promotion

```
POST  /campaigns/{id}/promote          Boost event — notify nearby users (organizer, once per campaign)
```

Logic on `POST /campaigns/{id}/promote`:
1. Check `promoted_at IS NULL` — reject if already promoted
2. Set `promoted_at = NOW()`, `promoted_until = NOW() + 24h`
3. Query all users within 10km who haven't signed up for this campaign
4. Enqueue notification job (email/push) for each user
5. Boosts feed score automatically via `promoted_until` check in recommendation

---

## 7. Leaderboard & Rewards

```
GET  /leaderboard?scope=global&period=all_time|monthly|weekly
GET  /leaderboard/nearby?lat=&lng=&radius_km=
GET  /me/points                        My total + transaction history
GET  /me/badges                        My earned badges
GET  /me/level                         Current level + % to next
```

### Points Award Logic

Call this after each trigger event. Keep it idempotent — pass `campaign_id` so you can check for duplicates.

```python
POINT_VALUES = {
    "signup":       5,
    "attend":       20,
    "organize":     50,
    "report":       10,
    "invite":       15,
    "streak_bonus": 30,
    "first_event":  10,   # one-time
}

async def award_points(user_id, action, campaign_id=None):
    # Guard: 'first_event' only awarded once
    if action == "first_event":
        exists = await db.fetchval(
            "SELECT 1 FROM user_points WHERE user_id=$1 AND action='first_event'", user_id)
        if exists:
            return

    await db.execute(
        "INSERT INTO user_points (user_id, campaign_id, action, points) VALUES ($1,$2,$3,$4)",
        user_id, campaign_id, action, POINT_VALUES[action]
    )
    await check_and_award_badges(user_id)
    await check_streak(user_id)
```

### Level Tiers

```python
LEVELS = [
    (0,   1, "Seedling"),
    (50,  2, "Sprout"),
    (150, 3, "Bloom"),
    (350, 4, "Branch"),
    (700, 5, "Squeeze Champion"),
]

def get_level(total_points: int) -> dict:
    current = LEVELS[0]
    for min_pts, level, name in LEVELS:
        if total_points >= min_pts:
            current = (min_pts, level, name)
    next_idx = current[1]  # level index
    if next_idx < len(LEVELS):
        next_min = LEVELS[next_idx][0]
        progress = (total_points - current[0]) / (next_min - current[0])
    else:
        progress = 1.0  # max level
    return {"level": current[1], "name": current[2], "progress_pct": round(progress * 100)}
```

### Streak Detection

```python
async def check_streak(user_id: str):
    rows = await db.fetch("""
        SELECT DISTINCT DATE_TRUNC('month', s.joined_at)::date AS month
        FROM signups s
        WHERE s.user_id = $1 AND s.status = 'confirmed'
        ORDER BY month DESC
    """, user_id)

    streak = 0
    expected = date.today().replace(day=1)
    for row in rows:
        if row["month"] == expected:
            streak += 1
            expected = (expected - timedelta(days=1)).replace(day=1)
        else:
            break

    if streak > 0 and streak % 3 == 0:
        await award_points(user_id, "streak_bonus")
```

### Badge Triggers

```python
async def check_and_award_badges(user_id: str):
    total_attendances = await db.fetchval(
        "SELECT COUNT(*) FROM signups WHERE user_id=$1 AND status='confirmed'", user_id)
    total_campaigns = await db.fetchval(
        "SELECT COUNT(*) FROM campaigns WHERE organizer_id=$1", user_id)
    total_flyers = await db.fetchval(
        "SELECT COALESCE(SUM(i.flyers_distributed),0) FROM impact_reports i "
        "JOIN campaigns c ON c.id=i.campaign_id "
        "JOIN signups s ON s.campaign_id=c.id "
        "WHERE s.user_id=$1 AND s.status='confirmed'", user_id)
    total_invites = await db.fetchval(
        "SELECT COUNT(*) FROM invitations WHERE invited_by=$1 AND status='accepted'", user_id)

    badge_rules = [
        ("first_event",  total_attendances >= 1),
        ("5_events",     total_attendances >= 5),
        ("organizer",    total_campaigns >= 1),
        ("recruiter",    total_invites >= 3),
        ("impact_100",   total_flyers >= 100),
    ]
    for slug, condition in badge_rules:
        if condition:
            await db.execute(
                "INSERT INTO user_badges (user_id, badge_slug) VALUES ($1,$2) ON CONFLICT DO NOTHING",
                user_id, slug)
```

---

## 8. Map Endpoints

```
GET  /map/campaigns?lat=&lng=&radius_km=&status=published
GET  /map/food-pantries?lat=&lng=&radius_km=
GET  /map/heatmap?start=&end=           Impact heatmap data (admin)
```

**Distance filter (no PostGIS needed):**
```sql
SELECT *,
  (6371 * acos(
    cos(radians(:lat)) * cos(radians(latitude)) *
    cos(radians(longitude) - radians(:lng)) +
    sin(radians(:lat)) * sin(radians(latitude))
  )) AS distance_km
FROM campaigns
WHERE status = 'published'
HAVING distance_km <= :radius_km
ORDER BY distance_km;
```

**Map pin response shape** (keep lightweight):
```json
{
  "campaigns": [
    {
      "id": "uuid",
      "title": "North Side Flyering",
      "latitude": 41.8781,
      "longitude": -87.6298,
      "date": "2026-03-20",
      "signup_count": 4,
      "max_volunteers": 10,
      "status": "published"
    }
  ]
}
```

---

## 9. Admin Endpoints

```
GET  /admin/analytics/overview
GET  /admin/analytics/trends?period=weekly|monthly
GET  /admin/analytics/impact-map
GET  /admin/campaigns?status=&date_from=&date_to=
GET  /admin/campaigns/{id}
PUT  /admin/campaigns/{id}/status       { "status": "cancelled" }
GET  /admin/users?sort=points&role=
GET  /admin/flyer-templates
POST /admin/flyer-templates
PUT  /admin/flyer-templates/{id}
DELETE /admin/flyer-templates/{id}
GET  /admin/food-pantries
PUT  /admin/food-pantries/{id}/verify   { "is_verified": true }
```

**GET /admin/analytics/overview — Response:**
```json
{
  "total_campaigns": 42,
  "total_volunteers": 188,
  "total_flyers_distributed": 12400,
  "total_families_reached": 3200,
  "campaigns_this_month": 8,
  "active_campaigns": 5
}
```

---

## 10. Food Pantry Endpoints

```
POST  /pantry/register               New pantry signup (creates user + pantry record)
GET   /pantry/me                     My pantry profile (auth, pantry owner)
PUT   /pantry/me                     Update profile (auth, pantry owner)
GET   /pantry/me/campaigns           Campaigns linked to my pantry
POST  /pantry/me/campaigns/{id}/link Link an existing campaign
GET   /pantries                      Public list
GET   /pantries/{id}                 Public pantry detail
```

---

## Error Response Format

Always return this shape on errors:
```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "CAMPAIGN_NOT_FOUND"
}
```

## Success Response Format

```json
{
  "success": true,
  "data": { ... }
}
```

Paginated:
```json
{
  "success": true,
  "data": [...],
  "meta": { "total": 100, "page": 1, "limit": 20 }
}
```
