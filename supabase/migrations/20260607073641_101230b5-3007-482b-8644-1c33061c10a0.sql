
CREATE TABLE public.playbook_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  trade_count INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC,
  avg_r NUMERIC,
  net_pnl NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playbook_entries TO authenticated;
GRANT ALL ON public.playbook_entries TO service_role;

ALTER TABLE public.playbook_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own playbook entries"
ON public.playbook_entries FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_playbook_entries_updated_at
BEFORE UPDATE ON public.playbook_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_playbook_entries_user ON public.playbook_entries(user_id, created_at DESC);
