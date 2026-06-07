
ALTER TABLE public.daily_game_plans
  ADD COLUMN IF NOT EXISTS vix numeric;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS baseline_vix numeric NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS vix_adjustment_enabled boolean NOT NULL DEFAULT true;
