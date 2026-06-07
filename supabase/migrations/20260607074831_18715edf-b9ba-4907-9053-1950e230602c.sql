CREATE TABLE IF NOT EXISTS public.scaling_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tier_number SMALLINT NOT NULL,
  name TEXT NOT NULL,
  min_balance NUMERIC NOT NULL,
  max_balance NUMERIC,
  instruments TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  max_risk_pct NUMERIC NOT NULL DEFAULT 5,
  max_trades_per_day SMALLINT NOT NULL DEFAULT 2,
  target_rr NUMERIC NOT NULL DEFAULT 1.5,
  focus TEXT,
  extra_rules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tier_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scaling_tiers TO authenticated;
GRANT ALL ON public.scaling_tiers TO service_role;

ALTER TABLE public.scaling_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own scaling tiers"
  ON public.scaling_tiers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_scaling_tiers_updated_at
  BEFORE UPDATE ON public.scaling_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS acknowledged_tier_number SMALLINT NOT NULL DEFAULT 0;