
CREATE OR REPLACE FUNCTION public.recalculate_behavioral_snapshot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wr_after_2w numeric;
  v_wr_after_2l numeric;
  v_wr_t1 numeric;
  v_wr_t2 numeric;
  v_wr_t3 numeric;
  v_best_hour int;
  v_worst_hour int;
  v_best_dow int;
  v_worst_dow int;
BEGIN
  SELECT
    AVG(CASE WHEN consecutive_wins_before >= 2 THEN (result = 'Win')::int END),
    AVG(CASE WHEN consecutive_losses_before >= 2 THEN (result = 'Win')::int END),
    AVG(CASE WHEN session_trade_number = 1 THEN (result = 'Win')::int END),
    AVG(CASE WHEN session_trade_number = 2 THEN (result = 'Win')::int END),
    AVG(CASE WHEN session_trade_number = 3 THEN (result = 'Win')::int END)
  INTO v_wr_after_2w, v_wr_after_2l, v_wr_t1, v_wr_t2, v_wr_t3
  FROM public.trades
  WHERE user_id = p_user_id AND deleted_at IS NULL AND result IN ('Win','Loss');

  SELECT hour_of_day INTO v_best_hour FROM public.trades
   WHERE user_id = p_user_id AND deleted_at IS NULL AND result IN ('Win','Loss')
     AND hour_of_day IS NOT NULL
   GROUP BY hour_of_day HAVING COUNT(*) >= 3
   ORDER BY AVG((result = 'Win')::int) DESC, COUNT(*) DESC LIMIT 1;

  SELECT hour_of_day INTO v_worst_hour FROM public.trades
   WHERE user_id = p_user_id AND deleted_at IS NULL AND result IN ('Win','Loss')
     AND hour_of_day IS NOT NULL
   GROUP BY hour_of_day HAVING COUNT(*) >= 3
   ORDER BY AVG((result = 'Win')::int) ASC, COUNT(*) DESC LIMIT 1;

  SELECT day_of_week INTO v_best_dow FROM public.trades
   WHERE user_id = p_user_id AND deleted_at IS NULL AND result IN ('Win','Loss')
     AND day_of_week IS NOT NULL
   GROUP BY day_of_week HAVING COUNT(*) >= 3
   ORDER BY AVG((result = 'Win')::int) DESC, COUNT(*) DESC LIMIT 1;

  SELECT day_of_week INTO v_worst_dow FROM public.trades
   WHERE user_id = p_user_id AND deleted_at IS NULL AND result IN ('Win','Loss')
     AND day_of_week IS NOT NULL
   GROUP BY day_of_week HAVING COUNT(*) >= 3
   ORDER BY AVG((result = 'Win')::int) ASC, COUNT(*) DESC LIMIT 1;

  INSERT INTO public.behavioral_snapshots (
    user_id, snapshot_date,
    win_rate_after_2_consec_wins, win_rate_after_2_consec_losses,
    win_rate_trade_1_of_day, win_rate_trade_2_of_day, win_rate_trade_3_of_day,
    best_hour_of_day, worst_hour_of_day, best_day_of_week, worst_day_of_week
  ) VALUES (
    p_user_id, CURRENT_DATE,
    v_wr_after_2w, v_wr_after_2l, v_wr_t1, v_wr_t2, v_wr_t3,
    v_best_hour, v_worst_hour, v_best_dow, v_worst_dow
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_all_behavioral_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.trades WHERE deleted_at IS NULL LOOP
    PERFORM public.recalculate_behavioral_snapshot(r.user_id);
  END LOOP;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('recalculate-behavioral-snapshots-weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'recalculate-behavioral-snapshots-weekly',
  '30 0 * * 0',
  $$ SELECT public.recalculate_all_behavioral_snapshots(); $$
);
