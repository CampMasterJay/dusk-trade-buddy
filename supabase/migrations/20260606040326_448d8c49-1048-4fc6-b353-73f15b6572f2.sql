
-- Tighten trade_journals policy to authenticated role only
DROP POLICY IF EXISTS "Users can manage their own trade journals" ON public.trade_journals;
CREATE POLICY "Users can manage their own trade journals"
  ON public.trade_journals
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_trades_user_created
  ON public.trades (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trades_user_result
  ON public.trades (user_id, result);

-- chart_analyses(user_id, created_at) already exists as idx_chart_analyses_user_created

-- Per-user pre-calculated stats view (security_invoker so RLS applies as querying user)
DROP VIEW IF EXISTS public.trades_with_stats;
CREATE VIEW public.trades_with_stats
WITH (security_invoker = on) AS
SELECT
  user_id,
  COUNT(*)                                                                AS total_trades,
  COUNT(*) FILTER (WHERE result = 'win')                                  AS wins,
  COUNT(*) FILTER (WHERE result = 'loss')                                 AS losses,
  COUNT(*) FILTER (WHERE result = 'breakeven')                            AS breakevens,
  CASE WHEN COUNT(*) FILTER (WHERE result IN ('win','loss')) > 0
       THEN ROUND(
         (COUNT(*) FILTER (WHERE result = 'win'))::numeric
         / NULLIF(COUNT(*) FILTER (WHERE result IN ('win','loss')), 0) * 100, 2)
       ELSE 0 END                                                         AS win_rate,
  COALESCE(ROUND(AVG(r_multiple)::numeric, 3), 0)                         AS avg_r,
  COALESCE(ROUND(SUM(r_multiple)::numeric, 3), 0)                         AS total_r,
  COALESCE(ROUND(SUM(pnl)::numeric, 2), 0)                                AS total_pnl,
  COALESCE(ROUND(AVG(pnl)::numeric, 2), 0)                                AS avg_pnl,
  MAX(created_at)                                                         AS last_trade_at
FROM public.trades
WHERE deleted_at IS NULL
GROUP BY user_id;

GRANT SELECT ON public.trades_with_stats TO authenticated;
GRANT ALL    ON public.trades_with_stats TO service_role;
