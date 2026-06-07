
CREATE TABLE public.setup_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  setup_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',
  paused_at TIMESTAMPTZ,
  root_causes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  recovery_plan TEXT,
  snooze_until_trade_count INTEGER,
  trade_count_at_change INTEGER,
  probation_started_at TIMESTAMPTZ,
  probation_trades_at_start INTEGER,
  reactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, setup_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.setup_status TO authenticated;
GRANT ALL ON public.setup_status TO service_role;

ALTER TABLE public.setup_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own setup status"
  ON public.setup_status FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_setup_status_updated_at
  BEFORE UPDATE ON public.setup_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
