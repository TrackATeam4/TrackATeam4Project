9. Admin Endpoints
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
GET /admin/analytics/overview — Response:

{
  "total_campaigns": 42,
  "total_volunteers": 188,
  "total_flyers_distributed": 12400,
  "total_families_reached": 3200,
  "campaigns_this_month": 8,
  "active_campaigns": 5
}