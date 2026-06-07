
-- Add VIX at entry to trades
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS vix_at_entry numeric;

-- Add user-customisable VIX threshold tiers to user_settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS vix_tier_low_max numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS vix_tier_normal_max numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS vix_tier_elevated_max numeric NOT NULL DEFAULT 30;

-- Update trade-context trigger so vix_at_entry auto-populates
-- from the user's daily_game_plan VIX when it isn't supplied explicitly.
CREATE OR REPLACE FUNCTION public.calculate_trade_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ts timestamptz;
  v_ts_ct timestamptz;
  v_market_open timestamptz;
  v_last_loss_count int;
  v_last_win_count int;
  v_consec_wins int := 0;
  v_consec_losses int := 0;
  v_session_num int;
  v_starting_balance numeric;
  v_peak numeric;
  v_running numeric;
  v_dd_pct numeric;
  v_emotion text;
  v_regime text;
  v_plan_vix numeric;
  r record;
BEGIN
  v_ts := COALESCE(NEW.created_at, now());
  v_ts_ct := v_ts AT TIME ZONE 'America/Chicago';

  NEW.day_of_week := EXTRACT(DOW FROM v_ts_ct)::int + 1;
  NEW.hour_of_day := EXTRACT(HOUR FROM v_ts_ct)::int;

  v_market_open := (date_trunc('day', v_ts_ct) + interval '8 hours 30 minutes');
  NEW.time_since_market_open_minutes :=
    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_ts_ct - v_market_open)) / 60))::int;

  SELECT COUNT(*) + 1 INTO v_session_num
  FROM public.trades
  WHERE user_id = NEW.user_id AND deleted_at IS NULL AND date = NEW.date;
  NEW.session_trade_number := v_session_num;

  SELECT COUNT(*) INTO v_last_loss_count
  FROM public.trades
  WHERE user_id = NEW.user_id AND deleted_at IS NULL
    AND created_at > COALESCE((
      SELECT MAX(created_at) FROM public.trades
      WHERE user_id = NEW.user_id AND deleted_at IS NULL AND result = 'Loss'
    ), '-infinity'::timestamptz);
  NEW.trades_since_last_loss := v_last_loss_count;

  SELECT COUNT(*) INTO v_last_win_count
  FROM public.trades
  WHERE user_id = NEW.user_id AND deleted_at IS NULL
    AND created_at > COALESCE((
      SELECT MAX(created_at) FROM public.trades
      WHERE user_id = NEW.user_id AND deleted_at IS NULL AND result = 'Win'
    ), '-infinity'::timestamptz);
  NEW.trades_since_last_win := v_last_win_count;

  FOR r IN
    SELECT result FROM public.trades
    WHERE user_id = NEW.user_id AND deleted_at IS NULL
    ORDER BY created_at DESC
  LOOP
    IF r.result = 'Win' AND v_consec_losses = 0 THEN
      v_consec_wins := v_consec_wins + 1;
    ELSIF r.result = 'Loss' AND v_consec_wins = 0 THEN
      v_consec_losses := v_consec_losses + 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  NEW.consecutive_wins_before := v_consec_wins;
  NEW.consecutive_losses_before := v_consec_losses;

  SELECT starting_balance INTO v_starting_balance
  FROM public.user_settings WHERE user_id = NEW.user_id;
  v_starting_balance := COALESCE(v_starting_balance, 100);

  v_running := v_starting_balance;
  v_peak := v_starting_balance;
  FOR r IN
    SELECT pnl FROM public.trades
    WHERE user_id = NEW.user_id AND deleted_at IS NULL
    ORDER BY date ASC, created_at ASC
  LOOP
    v_running := v_running + COALESCE(r.pnl, 0);
    IF v_running > v_peak THEN v_peak := v_running; END IF;
  END LOOP;
  IF v_peak > 0 THEN
    v_dd_pct := GREATEST(0, (v_peak - v_running) / v_peak * 100);
  ELSE
    v_dd_pct := 0;
  END IF;
  NEW.account_drawdown_pct_at_entry := ROUND(v_dd_pct, 2);

  SELECT emotion INTO v_emotion
  FROM public.trade_journals
  WHERE user_id = NEW.user_id
  ORDER BY created_at DESC LIMIT 1;
  NEW.was_revenge_trade := (
    v_consec_losses >= 1 AND v_emotion IS NOT NULL AND (
      v_emotion ILIKE '%revenge%' OR v_emotion ILIKE '%angry%' OR
      v_emotion ILIKE '%tilt%' OR v_emotion ILIKE '%frustrat%'
    )
  );

  IF NEW.market_regime IS NULL THEN
    SELECT market_regime INTO v_regime
    FROM public.daily_game_plans
    WHERE user_id = NEW.user_id AND plan_date = NEW.date
    LIMIT 1;
    NEW.market_regime := v_regime;
  END IF;

  -- Auto-populate VIX-at-entry from the day's game plan if not provided.
  IF NEW.vix_at_entry IS NULL THEN
    SELECT vix INTO v_plan_vix
    FROM public.daily_game_plans
    WHERE user_id = NEW.user_id AND plan_date = NEW.date
    LIMIT 1;
    NEW.vix_at_entry := v_plan_vix;
  END IF;

  -- Stop placement: auto-derive distance and stop-hit flag when not supplied
  IF NEW.entry IS NOT NULL AND NEW.stop IS NOT NULL THEN
    NEW.stop_distance_points := ROUND(ABS(NEW.entry - NEW.stop)::numeric, 4);
  END IF;
  IF NEW.stop_was_hit_before_target IS NULL AND NEW.result IS NOT NULL THEN
    NEW.stop_was_hit_before_target := (NEW.result = 'Loss');
  END IF;

  RETURN NEW;
END;
$function$;
