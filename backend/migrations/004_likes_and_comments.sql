-- Migration 004: Campaign likes and comments

CREATE TABLE IF NOT EXISTS campaign_likes (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS campaign_comments (
  id          uuid        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  campaign_id uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  author_name text        NOT NULL DEFAULT 'Anonymous',
  body        text        NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_likes_campaign   ON campaign_likes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_comments_campaign ON campaign_comments(campaign_id);
