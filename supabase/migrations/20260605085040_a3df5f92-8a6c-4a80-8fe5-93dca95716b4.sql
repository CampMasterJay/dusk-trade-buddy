
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS timeframe_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS instrument text,
  ADD COLUMN IF NOT EXISTS tick_value numeric,
  ADD COLUMN IF NOT EXISTS session text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
