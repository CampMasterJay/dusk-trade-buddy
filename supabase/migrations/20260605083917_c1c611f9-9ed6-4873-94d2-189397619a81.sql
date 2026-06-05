CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  date DATE NOT NULL,
  instrument TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('Long', 'Short')),
  entry NUMERIC NOT NULL,
  stop NUMERIC NOT NULL,
  target NUMERIC NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('Win', 'Loss', 'Scratch')),
  r_multiple NUMERIC,
  pnl NUMERIC,
  range_size NUMERIC,
  notes TEXT,
  chart_url TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own trades"
ON public.trades
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  starting_balance NUMERIC NOT NULL DEFAULT 100,
  current_balance NUMERIC NOT NULL DEFAULT 100,
  risk_pct NUMERIC NOT NULL DEFAULT 15,
  rr_ratio NUMERIC NOT NULL DEFAULT 1.5,
  challenge_target NUMERIC NOT NULL DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
ON public.user_settings
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_trades_updated_at
BEFORE UPDATE ON public.trades
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
