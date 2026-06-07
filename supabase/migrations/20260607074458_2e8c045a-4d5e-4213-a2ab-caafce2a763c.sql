ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS playbook_score TEXT
  CHECK (playbook_score IN ('A+ Match','Partial Match','No Match','Avoid Pattern'));

CREATE INDEX IF NOT EXISTS trades_playbook_score_idx
  ON public.trades (user_id, playbook_score)
  WHERE deleted_at IS NULL;