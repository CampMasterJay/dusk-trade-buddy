
CREATE TABLE public.performance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  metric text NOT NULL,
  duration_ms integer NOT NULL,
  tokens_used integer,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.performance_logs TO authenticated;
GRANT ALL ON public.performance_logs TO service_role;

ALTER TABLE public.performance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own performance logs"
  ON public.performance_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own performance logs"
  ON public.performance_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_performance_logs_user_metric_created
  ON public.performance_logs (user_id, metric, created_at DESC);

CREATE INDEX idx_performance_logs_user_created
  ON public.performance_logs (user_id, created_at DESC);
