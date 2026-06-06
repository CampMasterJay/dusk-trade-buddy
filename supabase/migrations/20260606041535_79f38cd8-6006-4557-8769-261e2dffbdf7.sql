CREATE TABLE public.challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  started_at timestamp with time zone NOT NULL,
  ended_at timestamp with time zone NOT NULL DEFAULT now(),
  starting_balance numeric NOT NULL,
  target_balance numeric NOT NULL,
  final_balance numeric NOT NULL,
  total_trades integer NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  outcome text NOT NULL CHECK (outcome IN ('Won','Lost','Reset')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenges TO authenticated;
GRANT ALL ON public.challenges TO service_role;

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own challenges"
  ON public.challenges
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_challenges_user_ended ON public.challenges(user_id, ended_at DESC);