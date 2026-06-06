CREATE TABLE public.price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instrument text NOT NULL,
  price numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('above','below')),
  active boolean NOT NULL DEFAULT true,
  triggered_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX price_alerts_user_active_idx ON public.price_alerts (user_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alerts TO authenticated;
GRANT ALL ON public.price_alerts TO service_role;

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own price alerts"
  ON public.price_alerts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_price_alerts_updated_at
  BEFORE UPDATE ON public.price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enforce max 10 active alerts per user
CREATE OR REPLACE FUNCTION public.enforce_price_alert_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  active_count int;
BEGIN
  IF NEW.active THEN
    SELECT count(*) INTO active_count
    FROM public.price_alerts
    WHERE user_id = NEW.user_id AND active = true AND id <> NEW.id;
    IF active_count >= 10 THEN
      RAISE EXCEPTION 'Maximum 10 active price alerts per user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_price_alert_limit_trg
  BEFORE INSERT OR UPDATE ON public.price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_price_alert_limit();