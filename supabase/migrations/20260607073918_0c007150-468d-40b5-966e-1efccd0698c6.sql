
ALTER TABLE public.playbook_entries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS baseline_win_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS baseline_avg_r NUMERIC,
  ADD COLUMN IF NOT EXISTS baseline_trade_count INTEGER;

ALTER TABLE public.playbook_entries
  DROP CONSTRAINT IF EXISTS playbook_entries_status_check;
ALTER TABLE public.playbook_entries
  ADD CONSTRAINT playbook_entries_status_check
  CHECK (status IN ('Active', 'Testing', 'Retired'));

CREATE OR REPLACE FUNCTION public.enforce_playbook_entry_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_count INT;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM public.playbook_entries
  WHERE user_id = NEW.user_id;
  IF current_count >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 playbook entries per user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_playbook_entry_limit_trigger ON public.playbook_entries;
CREATE TRIGGER enforce_playbook_entry_limit_trigger
BEFORE INSERT ON public.playbook_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_playbook_entry_limit();
