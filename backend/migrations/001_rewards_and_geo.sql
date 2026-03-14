-- Migration 001: Add geo/promotion columns to campaigns, create rewards tables
-- Run against Supabase PostgreSQL

-- ─────────────────────────────────────────────
-- ALTER campaigns: add geo, tags, promotion columns
-- ─────────────────────────────────────────────

ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS latitude         FLOAT,
    ADD COLUMN IF NOT EXISTS longitude        FLOAT,
    ADD COLUMN IF NOT EXISTS tags             TEXT[],
    ADD COLUMN IF NOT EXISTS food_pantry_id   UUID,
    ADD COLUMN IF NOT EXISTS promoted_at      TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS promoted_until   TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_campaigns_lat_lng
    ON campaigns(latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_tags
    ON campaigns USING GIN(tags);

-- ─────────────────────────────────────────────
-- user_points: track point transactions
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_points (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    action      VARCHAR(50) NOT NULL,
    points      INT NOT NULL,
    awarded_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_points_user     ON user_points(user_id);
CREATE INDEX IF NOT EXISTS idx_user_points_awarded  ON user_points(awarded_at);

-- ─────────────────────────────────────────────
-- user_badges: track earned badges
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_badges (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_slug  VARCHAR(100) NOT NULL,
    awarded_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, badge_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
