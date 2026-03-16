-- Migration: 004_seed_historical_trends.sql
-- Seeds 52 weeks (~1 year) of historical data with a wavy, organic pattern:
--   spring ramp → summer dip → fall food-drive peak → holiday spike
--   → January slump → February recovery → current surge
-- Safe to re-run: skips if Seed: campaigns already exist.

DO $$
DECLARE
  v_organizer_id  uuid;
  v_user_ids      uuid[];
  v_user_count    int;
  v_campaign_id   uuid;

  v_week_offset   int;   -- weeks ago (52 = oldest, 1 = most recent)
  v_idx           int;   -- position in multiplier array (1=oldest, 52=newest)
  v_mult          int;   -- activity multiplier for this week
  v_campaign_cnt  int;
  v_signup_cnt    int;
  v_flyers        int;
  v_families      int;
  v_volunteers    int;
  i               int;
  j               int;

  -- 52-week activity multiplier array (oldest→newest).
  -- Shape: spring ramp → early-summer dip → fall harvest peak →
  --        holiday spike → Jan slump → Feb recovery → Mar surge
  multipliers int[] := ARRAY[
    -- Mar 2025 (w52-49)
     3,  4,  5,  6,
    -- Apr 2025 (w48-45)
     8, 10, 12, 14,
    -- May 2025 (w44-41) — spring peak
    18, 20, 18, 15,
    -- Jun 2025 (w40-37) — early summer dip
    12, 10,  9, 10,
    -- Jul 2025 (w36-33) — mild summer
    12, 15, 14, 12,
    -- Aug 2025 (w32-29) — building toward fall
    10, 13, 16, 20,
    -- Sep 2025 (w28-25) — fall food-drive season
    24, 28, 32, 35,
    -- Oct 2025 (w24-21) — fall peak then taper
    38, 32, 28, 24,
    -- Nov 2025 (w20-17) — Thanksgiving ramp
    26, 30, 36, 42,
    -- Dec 2025 (w16-13) — holiday spike then drop
    48, 40, 35, 28,
    -- Jan 2026 (w12-9)  — new year slump
    22, 18, 16, 20,
    -- Feb 2026 (w8-5)   — recovery
    25, 30, 35, 32,
    -- Mar 2026 (w4-1)   — current surge
    40, 50, 58, 68
  ];

BEGIN
  -- ── Guard ─────────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.campaigns WHERE title LIKE 'Seed:%' LIMIT 1) THEN
    RAISE NOTICE 'Seed data already present – skipping.';
    RETURN;
  END IF;

  -- ── Resolve users ─────────────────────────────────────────────────────────
  SELECT id INTO v_organizer_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_organizer_id IS NULL THEN
    RAISE NOTICE 'No users found – skipping.';
    RETURN;
  END IF;

  SELECT ARRAY(SELECT id FROM public.users ORDER BY created_at LIMIT 15)
  INTO v_user_ids;
  v_user_count := array_length(v_user_ids, 1);

  -- ── Seed loop: 52 weeks back → 1 week back ───────────────────────────────
  FOR v_week_offset IN REVERSE 52..1 LOOP
    v_idx  := 53 - v_week_offset;          -- 1 (oldest) → 52 (newest)
    v_mult := multipliers[v_idx];

    -- Scale metrics from the multiplier (mult 68 → ~4 campaigns, ~22 signups)
    v_campaign_cnt := GREATEST(1, v_mult / 16);
    v_signup_cnt   := GREATEST(2, v_mult / 3);
    v_flyers       := v_mult * 3;
    v_families     := v_mult;
    v_volunteers   := GREATEST(2, v_mult / 8);

    FOR i IN 1..v_campaign_cnt LOOP

      -- ── Campaign ──────────────────────────────────────────────────────────
      INSERT INTO public.campaigns (
        organizer_id, title, description, location, address,
        date, start_time, end_time, status,
        max_volunteers, target_flyers, tags, created_at, updated_at
      ) VALUES (
        v_organizer_id,
        'Seed: Community Food Drive W' || v_idx || '-' || i,
        'Seeded historical campaign for activity trend analytics.',
        'Community Center',
        '100 Lemon Ave, Cityville, ST 00000',
        (NOW() - (v_week_offset || ' weeks')::interval
               + ((i - 1) || ' days')::interval
               + '3 days'::interval)::date,
        '09:00', '17:00', 'completed',
        25, 150, '{}',
        NOW() - (v_week_offset || ' weeks')::interval
              + (((i - 1) * 18) || ' hours')::interval,
        NOW() - (v_week_offset || ' weeks')::interval
              + (((i - 1) * 18) || ' hours')::interval
      )
      RETURNING id INTO v_campaign_id;

      -- ── Signups ───────────────────────────────────────────────────────────
      FOR j IN 1..LEAST(v_signup_cnt, v_user_count) LOOP
        INSERT INTO public.signups (campaign_id, user_id, status, joined_at)
        VALUES (
          v_campaign_id,
          v_user_ids[j],
          'confirmed',
          NOW() - (v_week_offset || ' weeks')::interval
                + ((j * 2) || ' hours')::interval
        );
      END LOOP;

      -- ── Impact report ─────────────────────────────────────────────────────
      INSERT INTO public.impact_reports (
        campaign_id, submitted_by,
        flyers_distributed, families_reached, volunteers_attended,
        notes, submitted_at
      ) VALUES (
        v_campaign_id, v_organizer_id,
        v_flyers + (i * 5),
        v_families + (i * 2),
        LEAST(v_volunteers + i, 25),
        'Auto-seeded impact report for historical analytics.',
        NOW() - (v_week_offset || ' weeks')::interval + '4 days'::interval
      );

      -- ── Points ────────────────────────────────────────────────────────────
      FOR j IN 1..LEAST(v_signup_cnt, v_user_count) LOOP
        INSERT INTO public.user_points (
          user_id, campaign_id, action, points, awarded_at
        ) VALUES (
          v_user_ids[j],
          v_campaign_id,
          'campaign_attendance',
          10 + (v_idx % 6) + j,
          NOW() - (v_week_offset || ' weeks')::interval + '5 days'::interval
        );
      END LOOP;

    END LOOP; -- campaigns per week
  END LOOP;   -- weeks

  RAISE NOTICE 'Historical seed complete. 52 weeks of wavy trend data inserted.';
END $$;
