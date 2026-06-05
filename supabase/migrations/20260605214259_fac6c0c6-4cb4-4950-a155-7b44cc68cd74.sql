CREATE TABLE public.watch_setups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instrument TEXT NOT NULL,
  direction_pref TEXT NOT NULL DEFAULT 'both',
  range_high NUMERIC NOT NULL,
  range_low NUMERIC NOT NULL,
  range_size NUMERIC NOT NULL,
  buffer_ticks NUMERIC NOT NULL DEFAULT 2,
  tick_size NUMERIC NOT NULL DEFAULT 0.25,
  rr_ratio NUMERIC NOT NULL DEFAULT 1.5,
  avg_range NUMERIC,
  long_entry NUMERIC,
  long_stop NUMERIC,
  long_target NUMERIC,
  short_entry NUMERIC,
  short_stop NUMERIC,
  short_target NUMERIC,
  quality_score SMALLINT,
  status TEXT NOT NULL DEFAULT 'watching',
  notes TEXT,
  linked_trade_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_setups TO authenticated;
GRANT ALL ON public.watch_setups TO service_role;

ALTER TABLE public.watch_setups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own watch setups"
  ON public.watch_setups
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_watch_setups_updated_at
  BEFORE UPDATE ON public.watch_setups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_watch_setups_user_status ON public.watch_setups(user_id, status, created_at DESC);