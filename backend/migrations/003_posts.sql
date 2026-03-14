-- Migration 003: Add posts + event impact reports

DO $$ BEGIN
    CREATE TYPE post_type AS ENUM ('upcoming_event', 'event_summary');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS posts (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type             post_type NOT NULL DEFAULT 'upcoming_event',
    title            TEXT,
    content          TEXT NOT NULL,
    event_location   TEXT,
    event_date       DATE,
    event_time_start TIME,
    event_time_end   TIME,
    volunteer_goal   INT,
    flyer_goal       INT,
    event_lat        FLOAT,
    event_lng        FLOAT,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type);

CREATE TABLE IF NOT EXISTS event_impact_reports (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    submitted_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    flyers_distributed INT NOT NULL DEFAULT 0,
    families_reached   INT NOT NULL DEFAULT 0,
    volunteers_attended INT NOT NULL DEFAULT 0,
    notes              TEXT,
    photos             TEXT[] NOT NULL DEFAULT '{}',
    submitted_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_impact_event ON event_impact_reports(event_id);
