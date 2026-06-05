ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS watchlist text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.user_settings
ADD CONSTRAINT user_settings_watchlist_max_10
CHECK (array_length(watchlist, 1) IS NULL OR array_length(watchlist, 1) <= 10);