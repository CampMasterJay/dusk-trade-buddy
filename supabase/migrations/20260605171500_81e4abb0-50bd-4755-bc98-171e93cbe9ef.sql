
CREATE TABLE public.chart_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  chart_url TEXT,
  instrument TEXT,
  timeframe TEXT,
  setup_detected TEXT,
  setup_quality SMALLINT,
  suggested_entry NUMERIC,
  suggested_stop NUMERIC,
  suggested_target NUMERIC,
  rr_ratio NUMERIC,
  bias_direction TEXT,
  trend TEXT,
  summary TEXT,
  raw_analysis JSONB,
  linked_trade_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_analyses TO authenticated;
GRANT ALL ON public.chart_analyses TO service_role;

ALTER TABLE public.chart_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own chart analyses"
  ON public.chart_analyses FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_chart_analyses_user_created ON public.chart_analyses(user_id, created_at DESC);
CREATE INDEX idx_chart_analyses_instrument ON public.chart_analyses(user_id, instrument);
CREATE INDEX idx_chart_analyses_setup ON public.chart_analyses(user_id, setup_detected);

CREATE TRIGGER update_chart_analyses_updated_at
  BEFORE UPDATE ON public.chart_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
