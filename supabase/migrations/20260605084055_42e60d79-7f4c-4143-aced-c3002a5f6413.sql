ALTER TABLE public.trades ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS trades_user_active_idx ON public.trades (user_id) WHERE deleted_at IS NULL;