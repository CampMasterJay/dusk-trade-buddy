CREATE TABLE public.daily_game_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_date DATE NOT NULL,
  bias TEXT NOT NULL DEFAULT 'Neutral',
  key_levels NUMERIC[] NOT NULL DEFAULT ARRAY[]::numeric[],
  planned_setups TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  max_trades INTEGER NOT NULL DEFAULT 2,
  max_loss NUMERIC,
  notes TEXT,
  discipline_score SMALLINT,
  stuck_to_max_trades BOOLEAN,
  stayed_within_loss BOOLEAN,
  traded_planned_setups BOOLEAN,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_game_plans TO authenticated;
GRANT ALL ON public.daily_game_plans TO service_role;

ALTER TABLE public.daily_game_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own game plans"
  ON public.daily_game_plans
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_daily_game_plans_updated_at
  BEFORE UPDATE ON public.daily_game_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX daily_game_plans_user_date_idx ON public.daily_game_plans (user_id, plan_date DESC);