
CREATE TABLE public.earnings_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  earnings_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker, earnings_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.earnings_events TO authenticated;
GRANT ALL ON public.earnings_events TO service_role;
ALTER TABLE public.earnings_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own earnings events"
  ON public.earnings_events FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX earnings_events_user_ticker_date_idx
  ON public.earnings_events (user_id, ticker, earnings_date);
CREATE TRIGGER update_earnings_events_updated_at
  BEFORE UPDATE ON public.earnings_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.options_trades
  ADD COLUMN IF NOT EXISTS is_earnings_play BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iv_before_earnings NUMERIC,
  ADD COLUMN IF NOT EXISTS iv_after_earnings NUMERIC;
