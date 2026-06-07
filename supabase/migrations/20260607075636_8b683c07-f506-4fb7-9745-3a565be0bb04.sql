ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS starting_playbook text,
  ADD COLUMN IF NOT EXISTS ending_playbook text,
  ADD COLUMN IF NOT EXISTS edge_health_trend text,
  ADD COLUMN IF NOT EXISTS most_used_regime text,
  ADD COLUMN IF NOT EXISTS most_profitable_setup text,
  ADD COLUMN IF NOT EXISTS biggest_behavioral_issue text;