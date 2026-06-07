CREATE TABLE public.prop_firm_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  prop_firm_id UUID NOT NULL REFERENCES public.prop_firms(id) ON DELETE RESTRICT,
  starting_balance NUMERIC NOT NULL,
  current_balance NUMERIC NOT NULL,
  peak_balance NUMERIC NOT NULL,
  challenge_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'In Challenge'
    CHECK (status IN ('In Challenge','Funded','Failed','Paused')),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prop_firm_accounts TO authenticated;
GRANT ALL ON public.prop_firm_accounts TO service_role;

ALTER TABLE public.prop_firm_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own prop firm accounts"
  ON public.prop_firm_accounts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX prop_firm_accounts_user_idx ON public.prop_firm_accounts (user_id);
CREATE INDEX prop_firm_accounts_active_idx ON public.prop_firm_accounts (user_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_prop_firm_accounts_updated_at
  BEFORE UPDATE ON public.prop_firm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep peak_balance >= current_balance automatically
CREATE OR REPLACE FUNCTION public.update_peak_balance()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.current_balance > COALESCE(NEW.peak_balance, NEW.starting_balance) THEN
    NEW.peak_balance := NEW.current_balance;
  END IF;
  IF NEW.peak_balance IS NULL THEN
    NEW.peak_balance := GREATEST(NEW.starting_balance, NEW.current_balance);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prop_firm_accounts_peak_balance
  BEFORE INSERT OR UPDATE ON public.prop_firm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_peak_balance();