
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS options_starting_balance numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS options_current_balance numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS options_challenge_target numeric NOT NULL DEFAULT 1000;

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'futures';

DO $$ BEGIN
  ALTER TABLE public.challenges
    ADD CONSTRAINT challenges_mode_check CHECK (mode IN ('futures','options'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_challenges_user_mode_ended
  ON public.challenges (user_id, mode, ended_at DESC);
