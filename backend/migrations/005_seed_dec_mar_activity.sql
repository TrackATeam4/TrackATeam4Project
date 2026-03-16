-- Migration: 005_seed_dec_mar_activity.sql
-- Seeds Dec 2025 → Mar 16 2026 with rich signup activity.
-- Pattern: quiet Dec → holiday spike → Jan dip → Valentine surge →
--          Mar rally with a viral week in early March.
-- Safe to re-run: skips if Trend: campaigns already exist.
--
-- Run in Supabase SQL Editor.

DO $$
DECLARE
  v_organizer_id  uuid;
  v_user_ids      uuid[];
  v_user_count    int;
  v_campaign_id   uuid;
  i               int;
  j               int;

  -- One row per week: (week_offset_days, campaign_count, signup_count, flyers, families)
  -- week_offset_days = days ago that this week started
  -- weeks run Mon→Sun, 16 weeks total covering Dec 1 2025 → Mar 15 2026
  TYPE week_spec IS RECORD (
    days_ago      int,
    label         text,
    campaigns     int,
    signups       int,
    flyers        int,
    families      int
  );
  w week_spec;

BEGIN
  -- ── Guard ─────────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.campaigns WHERE title LIKE 'Trend:%' LIMIT 1) THEN
    RAISE NOTICE 'Trend seed already present – skipping.';
    RETURN;
  END IF;

  SELECT id INTO v_organizer_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_organizer_id IS NULL THEN
    RAISE NOTICE 'No users – skipping.'; RETURN;
  END IF;

  SELECT ARRAY(SELECT id FROM public.users ORDER BY created_at LIMIT 20)
  INTO v_user_ids;
  v_user_count := array_length(v_user_ids, 1);

  -- ── Week specs (newest first so days_ago decreases) ───────────────────────
  -- Dec 1  week  → 105 days ago
  -- Dec 8  week  →  98 days ago
  -- Dec 15 week  →  91 days ago  (holiday ramp)
  -- Dec 22 week  →  84 days ago  (Christmas week dip)
  -- Dec 29 week  →  77 days ago  (New Year quiet)
  -- Jan 5  week  →  70 days ago  (slow start)
  -- Jan 12 week  →  63 days ago  (MLK Day surge)
  -- Jan 19 week  →  56 days ago  (viral spike — a campaign went viral)
  -- Jan 26 week  →  49 days ago  (settle back)
  -- Feb 2  week  →  42 days ago  (steady climb)
  -- Feb 9  week  →  35 days ago  (Valentine food drive)
  -- Feb 16 week  →  28 days ago  (peak so far)
  -- Feb 23 week  →  21 days ago  (brief pullback)
  -- Mar 2  week  →  14 days ago  (spring rally)
  -- Mar 9  week  →   7 days ago  (record week)
  -- Mar 16 partial→  0 days ago  (current week, partial)

  FOR w IN
    SELECT *
    FROM (VALUES
      (105, 'Dec-01', 1,  6,  45,  14),
      ( 98, 'Dec-08', 1,  9,  58,  18),
      ( 91, 'Dec-15', 2, 16,  90,  28),   -- holiday ramp
      ( 84, 'Dec-22', 1,  8,  40,  12),   -- Christmas dip
      ( 77, 'Dec-29', 1,  7,  35,  10),   -- New Year quiet
      ( 70, 'Jan-05', 2, 11,  65,  20),   -- slow restart
      ( 63, 'Jan-12', 3, 22, 120,  38),   -- MLK Day surge
      ( 56, 'Jan-19', 4, 48, 210,  68),   -- viral spike
      ( 49, 'Jan-26', 3, 28, 140,  44),   -- settle
      ( 42, 'Feb-02', 3, 32, 155,  50),   -- steady
      ( 35, 'Feb-09', 4, 42, 195,  62),   -- Valentine food drive
      ( 28, 'Feb-16', 4, 55, 240,  78),   -- peak
      ( 21, 'Feb-23', 3, 38, 170,  54),   -- pullback
      ( 14, 'Mar-02', 5, 65, 290,  92),   -- spring rally
      (  7, 'Mar-09', 6, 88, 370, 118),   -- record week
      (  0, 'Mar-16', 2, 20,  85,  27)    -- current partial week
    ) AS t(days_ago, label, campaigns, signups, flyers, families)
  LOOP

    FOR i IN 1..w.campaigns LOOP

      -- ── Campaign ────────────────────────────────────────────────────────────
      INSERT INTO public.campaigns (
        organizer_id, title, description, location, address,
        date, start_time, end_time, status,
        max_volunteers, target_flyers, tags, created_at, updated_at
      ) VALUES (
        v_organizer_id,
        'Trend: Food Drive ' || w.label || ' #' || i,
        'Seeded trend campaign – ' || w.label || '.',
        'Community Center',
        '100 Lemon Ave, Cityville, ST 00000',
        (NOW() - (w.days_ago || ' days')::interval + '2 days'::interval)::date,
        '09:00', '17:00',
        CASE WHEN w.days_ago > 0 THEN 'completed' ELSE 'published' END,
        30, 200, '{}',
        NOW() - (w.days_ago || ' days')::interval + (((i-1)*10) || ' hours')::interval,
        NOW() - (w.days_ago || ' days')::interval + (((i-1)*10) || ' hours')::interval
      )
      RETURNING id INTO v_campaign_id;

      -- ── Signups — spread the week's total across campaigns ────────────────
      -- Each campaign gets signups / campaign_count, distributed over different users
      FOR j IN 1..LEAST(w.signups / w.campaigns, v_user_count) LOOP
        INSERT INTO public.signups (campaign_id, user_id, status, joined_at)
        VALUES (
          v_campaign_id,
          v_user_ids[((i * 7 + j - 1) % v_user_count) + 1],   -- rotate users
          'confirmed',
          NOW() - (w.days_ago || ' days')::interval
                + ((j * 3 + i) || ' hours')::interval
        );
      END LOOP;

      -- ── Impact report (only for completed campaigns) ──────────────────────
      IF w.days_ago > 0 THEN
        INSERT INTO public.impact_reports (
          campaign_id, submitted_by,
          flyers_distributed, families_reached, volunteers_attended,
          notes, submitted_at
        ) VALUES (
          v_campaign_id, v_organizer_id,
          (w.flyers / w.campaigns) + (i * 6),
          (w.families / w.campaigns) + (i * 2),
          LEAST(w.signups / w.campaigns + i, 25),
          'Trend seed – ' || w.label,
          NOW() - (w.days_ago || ' days')::interval + '3 days'::interval
        );
      END IF;

      -- ── Points ────────────────────────────────────────────────────────────
      FOR j IN 1..LEAST(w.signups / w.campaigns, v_user_count) LOOP
        INSERT INTO public.user_points (
          user_id, campaign_id, action, points, awarded_at
        ) VALUES (
          v_user_ids[((i * 7 + j - 1) % v_user_count) + 1],
          v_campaign_id,
          'campaign_attendance',
          10 + (j % 8),
          NOW() - (w.days_ago || ' days')::interval + '4 days'::interval
        );
      END LOOP;

    END LOOP; -- campaigns
  END LOOP;   -- weeks

  RAISE NOTICE 'Trend seed complete: Dec 2025 → Mar 2026 inserted.';
END $$;
