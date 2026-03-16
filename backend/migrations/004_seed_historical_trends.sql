-- Migration: 004_seed_historical_trends.sql
-- Seeds 12 weeks of historical campaign/signup/impact/points data
-- to produce an organic growth curve in the Activity Trends graph.
-- Safe to re-run: skips if historical seed data already exists.

DO $$
DECLARE
  v_organizer_id  uuid;
  v_user_ids      uuid[];
  v_user_count    int;
  v_campaign_id   uuid;

  -- loop vars
  v_week_offset   int;   -- weeks ago (12 = oldest, 1 = most recent)
  v_age           int;   -- 13 - v_week_offset  (1 = oldest, 12 = newest)
  v_campaign_cnt  int;
  v_signup_cnt    int;
  v_flyers        int;
  v_families      int;
  v_volunteers    int;
  i               int;
  j               int;
BEGIN
  -- ── Guard: skip if we've already seeded historical data ──────────────────
  IF EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE title LIKE 'Seed:%'
    LIMIT 1
  ) THEN
    RAISE NOTICE 'Historical seed data already present – skipping.';
    RETURN;
  END IF;

  -- ── Resolve users ─────────────────────────────────────────────────────────
  -- Use the first registered user as the organizer for seeded campaigns
  SELECT id INTO v_organizer_id
  FROM public.users
  ORDER BY created_at
  LIMIT 1;

  IF v_organizer_id IS NULL THEN
    RAISE NOTICE 'No users found – skipping historical seed.';
    RETURN;
  END IF;

  -- Collect up to 15 user IDs for realistic signup spread
  SELECT ARRAY(
    SELECT id FROM public.users ORDER BY created_at LIMIT 15
  ) INTO v_user_ids;

  v_user_count := array_length(v_user_ids, 1);

  -- ── Seed 12 weeks back from today ────────────────────────────────────────
  -- Growth model (v_age goes 1→12, oldest→newest):
  --   campaigns  : 1, 1, 1, 2, 2, 2, 3, 4, 4, 5, 6, 8
  --   signups    : 3, 4, 5, 7, 8,10,13,16,20,25,30,38
  --   flyers     : 20,28,38,50,62,78,95,115,138,162,190,220
  --   families   : 6, 9,12,16,20,25,30,37,44,52,61,72

  FOR v_week_offset IN REVERSE 12..1 LOOP
    v_age := 13 - v_week_offset;   -- 1 (oldest) → 12 (most recent)

    -- Non-linear growth: quadratic ramp
    v_campaign_cnt := GREATEST(1, ROUND(0.055 * v_age * v_age)::int);
    v_signup_cnt   := GREATEST(3, ROUND(0.26  * v_age * v_age)::int);
    v_flyers       := GREATEST(20, ROUND(1.5  * v_age * v_age + 18)::int);
    v_families     := GREATEST(6,  ROUND(0.49 * v_age * v_age + 5)::int);
    v_volunteers   := GREATEST(2,  ROUND(0.18 * v_age * v_age + 1)::int);

    FOR i IN 1..v_campaign_cnt LOOP

      -- ── Insert campaign ────────────────────────────────────────────────────
      INSERT INTO public.campaigns (
        organizer_id,
        title,
        description,
        location,
        address,
        date,
        start_time,
        end_time,
        status,
        max_volunteers,
        target_flyers,
        tags,
        created_at,
        updated_at
      ) VALUES (
        v_organizer_id,
        'Seed: Community Food Drive W' || (13 - v_week_offset) || '-' || i,
        'Seeded historical campaign for activity trend analytics.',
        'Community Center',
        '100 Lemon Ave, Cityville, ST 00000',
        -- event date: 3 days after the campaign was "created"
        (NOW() - (v_week_offset || ' weeks')::interval
                + ((i - 1) || ' days')::interval
                + '3 days'::interval
        )::date,
        '09:00',
        '17:00',
        'completed',
        25,
        120,
        '{}',
        -- created_at: spread across the week, a few hours per campaign
        NOW() - (v_week_offset || ' weeks')::interval
              + (((i - 1) * 18) || ' hours')::interval,
        NOW() - (v_week_offset || ' weeks')::interval
              + (((i - 1) * 18) || ' hours')::interval
      )
      RETURNING id INTO v_campaign_id;

      -- ── Insert signups for this campaign ──────────────────────────────────
      FOR j IN 1..LEAST(v_signup_cnt, v_user_count) LOOP
        INSERT INTO public.signups (
          campaign_id,
          user_id,
          status,
          joined_at
        ) VALUES (
          v_campaign_id,
          v_user_ids[j],
          'confirmed',
          NOW() - (v_week_offset || ' weeks')::interval
                + ((j * 2) || ' hours')::interval
        );
      END LOOP;

      -- ── Insert impact report ──────────────────────────────────────────────
      INSERT INTO public.impact_reports (
        campaign_id,
        submitted_by,
        flyers_distributed,
        families_reached,
        volunteers_attended,
        notes,
        submitted_at
      ) VALUES (
        v_campaign_id,
        v_organizer_id,
        v_flyers + (i * 4),
        v_families + (i * 2),
        LEAST(v_volunteers + i, 20),
        'Auto-seeded impact report for historical analytics.',
        NOW() - (v_week_offset || ' weeks')::interval + '4 days'::interval
      );

      -- ── Award points to volunteers ────────────────────────────────────────
      FOR j IN 1..LEAST(v_signup_cnt, v_user_count) LOOP
        INSERT INTO public.user_points (
          user_id,
          campaign_id,
          action,
          points,
          awarded_at
        ) VALUES (
          v_user_ids[j],
          v_campaign_id,
          'campaign_attendance',
          10 + (v_age % 5) + j,
          NOW() - (v_week_offset || ' weeks')::interval + '5 days'::interval
        );
      END LOOP;

    END LOOP; -- campaigns per week
  END LOOP;   -- weeks

  RAISE NOTICE 'Historical seed complete. Seeded 12 weeks of trend data.';
END $$;
