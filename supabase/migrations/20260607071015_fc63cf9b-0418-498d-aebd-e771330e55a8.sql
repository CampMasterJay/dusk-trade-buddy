CREATE TABLE public.prop_firms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_name TEXT NOT NULL,
  account_size NUMERIC NOT NULL,
  monthly_fee NUMERIC,
  profit_target_pct NUMERIC,
  profit_target_amount NUMERIC,
  max_daily_loss_pct NUMERIC,
  max_daily_loss_amount NUMERIC,
  max_drawdown_pct NUMERIC,
  max_drawdown_amount NUMERIC,
  drawdown_type TEXT NOT NULL DEFAULT 'static' CHECK (drawdown_type IN ('static','trailing','intraday_trailing','eod_trailing')),
  payout_split_pct NUMERIC,
  payout_frequency TEXT,
  notes TEXT,
  website_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firm_name, account_size)
);

GRANT SELECT ON public.prop_firms TO anon;
GRANT SELECT ON public.prop_firms TO authenticated;
GRANT ALL ON public.prop_firms TO service_role;

ALTER TABLE public.prop_firms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Prop firms are viewable by everyone"
  ON public.prop_firms
  FOR SELECT
  USING (true);

CREATE TRIGGER update_prop_firms_updated_at
  BEFORE UPDATE ON public.prop_firms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX prop_firms_firm_name_idx ON public.prop_firms (firm_name);
CREATE INDEX prop_firms_active_idx ON public.prop_firms (is_active) WHERE is_active = true;