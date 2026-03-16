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

  w_days_ago      int;
  w_label         text;
  w_campaigns     int;
  w_signups       int;
  w_flyers        int;
  w_families      int;

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

  FOR w_days_ago, w_label, w_campaigns, w_signups, w_flyers, w_families IN
    VALUES
      (105, 'Dec-01', 1,  6,  45,  14),
      ( 98, 'Dec-08', 1,  9,  58,  18),
      ( 91, 'Dec-15', 2, 16,  90,  28),
      ( 84, 'Dec-22', 1,  8,  40,  12),
      ( 77, 'Dec-29', 1,  7,  35,  10),
      ( 70, 'Jan-05', 2, 11,  65,  20),
      ( 63, 'Jan-12', 3, 22, 120,  38),
      ( 56, 'Jan-19', 4, 48, 210,  68),
      ( 49, 'Jan-26', 3, 28, 140,  44),
      ( 42, 'Feb-02', 3, 32, 155,  50),
      ( 35, 'Feb-09', 4, 42, 195,  62),
      ( 28, 'Feb-16', 4, 55, 240,  78),
      ( 21, 'Feb-23', 3, 38, 170,  54),
      ( 14, 'Mar-02', 5, 65, 290,  92),
      (  7, 'Mar-09', 6, 88, 370, 118),
      (  0, 'Mar-16', 2, 20,  85,  27)
  LOOP

    FOR i IN 1..w_campaigns LOOP

      -- ── Campaign ────────────────────────────────────────────────────────────
      INSERT INTO public.campaigns (
        organizer_id, title, description, location, address,
        date, start_time, end_time, status,
        max_volunteers, target_flyers, tags, created_at, updated_at
      ) VALUES (
        v_organizer_id,
        'Trend: Food Drive ' || w_label || ' #' || i,
        'Seeded trend campaign – ' || w_label || '.',
        'Community Center',
        '100 Lemon Ave, Cityville, ST 00000',
        (NOW() - (w_days_ago || ' days')::interval + '2 days'::interval)::date,
        '09:00', '17:00',
        CASE WHEN w_days_ago > 0 THEN 'completed'::campaign_status ELSE 'published'::campaign_status END,
        30, 200, '{}',
        NOW() - (w_days_ago || ' days')::interval + (((i-1)*10) || ' hours')::interval,
        NOW() - (w_days_ago || ' days')::interval + (((i-1)*10) || ' hours')::interval
      )
      RETURNING id INTO v_campaign_id;

      -- ── Signups ───────────────────────────────────────────────────────────
      FOR j IN 1..LEAST(w_signups / w_campaigns, v_user_count) LOOP
        INSERT INTO public.signups (campaign_id, user_id, status, joined_at)
        VALUES (
          v_campaign_id,
          v_user_ids[((i * 7 + j - 1) % v_user_count) + 1],
          'confirmed',
          NOW() - (w_days_ago || ' days')::interval
                + ((j * 3 + i) || ' hours')::interval
        );
      END LOOP;

      -- ── Impact report (completed campaigns only) ──────────────────────────
      IF w_days_ago > 0 THEN
        INSERT INTO public.impact_reports (
          campaign_id, submitted_by,
          flyers_distributed, families_reached, volunteers_attended,
          notes, submitted_at
        ) VALUES (
          v_campaign_id, v_organizer_id,
          (w_flyers / w_campaigns) + (i * 6),
          (w_families / w_campaigns) + (i * 2),
          LEAST(w_signups / w_campaigns + i, 25),
          'Trend seed – ' || w_label,
          NOW() - (w_days_ago || ' days')::interval + '3 days'::interval
        );
      END IF;

      -- ── Points ────────────────────────────────────────────────────────────
      FOR j IN 1..LEAST(w_signups / w_campaigns, v_user_count) LOOP
        INSERT INTO public.user_points (
          user_id, campaign_id, action, points, awarded_at
        ) VALUES (
          v_user_ids[((i * 7 + j - 1) % v_user_count) + 1],
          v_campaign_id,
          'campaign_attendance',
          10 + (j % 8),
          NOW() - (w_days_ago || ' days')::interval + '4 days'::interval
        );
      END LOOP;

    END LOOP; -- campaigns
  END LOOP;   -- weeks

  RAISE NOTICE 'Trend seed complete: Dec 2025 → Mar 2026 inserted.';
END $$;
