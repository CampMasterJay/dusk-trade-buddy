ALTER TABLE public.weekly_debriefs
  ADD COLUMN IF NOT EXISTS behavioral_patterns text,
  ADD COLUMN IF NOT EXISTS regime_performance text,
  ADD COLUMN IF NOT EXISTS setup_health_update text,
  ADD COLUMN IF NOT EXISTS vix_impact text,
  ADD COLUMN IF NOT EXISTS prop_firm_progress text,
  ADD COLUMN IF NOT EXISTS tier_progress text;