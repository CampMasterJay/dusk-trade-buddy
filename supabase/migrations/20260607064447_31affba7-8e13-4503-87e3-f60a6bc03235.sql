
-- trades columns
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS trades_since_last_loss integer,
  ADD COLUMN IF NOT EXISTS trades_since_last_win integer,
  ADD COLUMN IF NOT EXISTS session_trade_number integer,
  ADD COLUMN IF NOT EXISTS time_since_market_open_minutes integer,
  ADD COLUMN IF NOT EXISTS day_of_week integer,
  ADD COLUMN IF NOT EXISTS hour_of_day integer,
  ADD COLUMN IF NOT EXISTS account_drawdown_pct_at_entry numeric,
  ADD COLUMN IF NOT EXISTS was_revenge_trade boolean,
  ADD COLUMN IF NOT EXISTS consecutive_wins_before integer,
  ADD COLUMN IF NOT EXISTS consecutive_losses_before integer;

CREATE OR REPLACE FUNCTION public.calculate_trade_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_trade_context() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_trade_context() TO service_role;
REVOKE ALL ON FUNCTION public.recalculate_behavioral_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_behavioral_snapshot(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.recalculate_all_behavioral_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_behavioral_snapshots() TO service_role;

DROP TRIGGER IF EXISTS trg_calculate_trade_context ON public.trades;
CREATE TRIGGER trg_calculate_trade_context
BEFORE INSERT ON public.trades
FOR EACH ROW EXECUTE FUNCTION public.calculate_trade_context();

-- behavioral_snapshots table
CREATE TABLE IF NOT EXISTS public.behavioral_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  win_rate_after_2_consec_wins numeric,
  win_rate_after_2_consec_losses numeric,
  win_rate_trade_1_of_day numeric,
  win_rate_trade_2_of_day numeric,
  win_rate_trade_3_of_day numeric,
  best_hour_of_day integer,
  worst_hour_of_day integer,
  best_day_of_week integer,
  worst_day_of_week integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.behavioral_snapshots TO authenticated;
GRANT ALL ON public.behavioral_snapshots TO service_role;

ALTER TABLE public.behavioral_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own behavioral snapshots" ON public.behavioral_snapshots;
CREATE POLICY "Users can manage their own behavioral snapshots"
ON public.behavioral_snapshots FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_behavioral_snapshots_updated_at ON public.behavioral_snapshots;
CREATE TRIGGER update_behavioral_snapshots_updated_at
BEFORE UPDATE ON public.behavioral_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_behavioral_snapshots_user_date
  ON public.behavioral_snapshots(user_id, snapshot_date DESC);
