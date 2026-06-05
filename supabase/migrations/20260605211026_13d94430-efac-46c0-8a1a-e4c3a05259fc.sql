ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS news_id text;
CREATE INDEX IF NOT EXISTS trades_news_id_idx ON public.trades (news_id) WHERE news_id IS NOT NULL;