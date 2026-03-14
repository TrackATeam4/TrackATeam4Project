# TrackA – Backend API Endpoints & Database Schema

> Lemontree Volunteer Flyering Campaign Platform

---

## Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| email | varchar | unique |
| name | varchar | |
| role | enum | `volunteer`, `admin` |
| created_at | timestamp | |

---

### `campaigns`
A flyering event created by a volunteer organizer.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| organizer_id | uuid | FK → users.id |
| title | varchar | |
| description | text | |
| location | varchar | neighborhood/area name |
| address | varchar | meeting point |
| date | date | |
| start_time | time | |
| end_time | time | |
| status | enum | `draft`, `published`, `completed`, `cancelled` |
| max_volunteers | int | nullable – no cap if null |
| target_flyers | int | goal # of flyers to distribute |
| flyer_template_id | uuid | FK → flyer_templates.id |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### `signups`
Volunteer registration for a campaign.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns.id |
| user_id | uuid | FK → users.id |
| status | enum | `pending`, `confirmed`, `cancelled` |
| task_id | uuid | FK → tasks.id, nullable |
| joined_at | timestamp | |

---

### `tasks`
Role or area assignments within a campaign (e.g. "North block", "Welcome table").

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns.id |
| title | varchar | |
| description | text | |
| assigned_to | uuid | FK → users.id, nullable |
| max_assignees | int | default 1 |
| created_at | timestamp | |

---

### `flyer_templates`
Brand-approved base templates managed by Lemontree staff.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | varchar | |
| file_url | varchar | Supabase Storage URL |
| thumbnail_url | varchar | |
| customizable_fields | jsonb | e.g. `{"event_name": true, "date": true, "logo": false}` |
| is_active | boolean | |
| created_at | timestamp | |

---

### `campaign_flyers`
Volunteer-personalized flyer for a specific campaign (built on top of a template).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns.id |
| template_id | uuid | FK → flyer_templates.id |
| custom_fields | jsonb | volunteer-filled values |
| generated_file_url | varchar | Supabase Storage URL |
| created_at | timestamp | |

---

### `impact_reports`
Post-event data submitted by the organizer.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns.id |
| submitted_by | uuid | FK → users.id |
| flyers_distributed | int | |
| families_reached | int | |
| volunteers_attended | int | |
| notes | text | |
| photos | text[] | array of Supabase Storage URLs |
| submitted_at | timestamp | |

---

### `invitations`
Email invites sent to non-users to join a campaign.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns.id |
| invited_by | uuid | FK → users.id |
| email | varchar | |
| token | varchar | unique, used in invite link |
| status | enum | `pending`, `accepted`, `expired` |
| expires_at | timestamp | |
| created_at | timestamp | |

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/signup` | Register with email/password |
| POST | `/auth/signin` | Login with email/password |
| POST | `/auth/google` | Google OAuth login |
| POST | `/auth/signout` | Sign out |

---

### Campaigns
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/campaigns` | — | List all published campaigns |
| POST | `/campaigns` | ✅ | Create a new campaign |
| GET | `/campaigns/{id}` | — | Get campaign detail |
| PUT | `/campaigns/{id}` | ✅ organizer | Update campaign |
| DELETE | `/campaigns/{id}` | ✅ organizer | Cancel/delete campaign |
| GET | `/campaigns/{id}/signups` | ✅ organizer | List all signups for campaign |
| GET | `/campaigns/mine` | ✅ | Campaigns I created |
| GET | `/campaigns/joined` | ✅ | Campaigns I signed up for |

---

### Signups
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/campaigns/{id}/signup` | ✅ | Volunteer registers for event |
| DELETE | `/campaigns/{id}/signup` | ✅ | Volunteer withdraws from event |

---

### Tasks
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/campaigns/{id}/tasks` | — | List tasks for a campaign |
| POST | `/campaigns/{id}/tasks` | ✅ organizer | Create a task |
| PUT | `/tasks/{id}` | ✅ organizer | Update task / assign volunteer |
| DELETE | `/tasks/{id}` | ✅ organizer | Delete task |

---

### Flyer Materials
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/flyer-templates` | — | List all active brand-approved templates |
| GET | `/flyer-templates/{id}` | — | Get a single template |
| POST | `/campaigns/{id}/flyer` | ✅ organizer | Save personalized flyer for campaign |
| GET | `/campaigns/{id}/flyer` | — | Get campaign's flyer (download/share) |

---

### Invitations
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/campaigns/{id}/invite` | ✅ organizer | Send email invite(s) to join campaign |
| GET | `/invite/{token}` | — | Validate invite token → redirect to signup |

---

### Impact Reporting
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/campaigns/{id}/impact` | ✅ organizer | Submit post-event impact report |
| GET | `/campaigns/{id}/impact` | ✅ | Get impact report for a campaign |
| GET | `/impact/summary` | ✅ admin | Aggregate stats across all campaigns |

---

### Admin (Lemontree Staff)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/campaigns` | ✅ admin | All campaigns with status and impact |
| GET | `/admin/campaigns/{id}` | ✅ admin | Full campaign detail view |
| GET | `/admin/impact` | ✅ admin | Aggregate impact dashboard |
| GET | `/admin/flyer-templates` | ✅ admin | List all templates |
| POST | `/admin/flyer-templates` | ✅ admin | Upload new template |
| PUT | `/admin/flyer-templates/{id}` | ✅ admin | Update template |
| DELETE | `/admin/flyer-templates/{id}` | ✅ admin | Deactivate template |

---

## Key Design Decisions

### Flyer Personalization
- `customizable_fields` on `flyer_templates` is an allowlist (JSON) — volunteers can only edit pre-approved fields
- Brand elements (logo, colors, core messaging) are locked at the template level
- Lemontree controls all templates via the admin endpoints

### Impact Data
- Kept deliberately lightweight: 3 numeric fields + free-text notes + optional photos
- Low friction for volunteers to submit; enough signal for Lemontree to aggregate

### Admin Visibility
- No separate admin workflow is needed — staff get read-only views into volunteer-created data
- Zero staff burden for day-to-day operations

### Storage
- Use **Supabase Storage** for flyer PDFs and impact photos (already in the stack)

### Notifications (Email)
- Invite emails → triggered by `POST /campaigns/{id}/invite`
- Signup confirmation → triggered on `POST /campaigns/{id}/signup`
- Event reminder → scheduled job (e.g. 24h before campaign date)
- Implement via Supabase Edge Functions or a transactional email service (Resend, SendGrid)

### Auth & Authorization Levels
| Level | Who | Access |
|-------|-----|--------|
| Public | Anyone | Browse campaigns, view flyers, accept invites |
| Volunteer | Authenticated user | Sign up, submit impact (for own campaigns) |
| Organizer | Campaign creator | Full CRUD on their campaign, tasks, invites |
| Admin | Lemontree staff (`role = admin`) | Read all data, manage flyer templates |
