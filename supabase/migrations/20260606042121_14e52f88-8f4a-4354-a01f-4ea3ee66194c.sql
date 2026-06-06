CREATE TABLE public.weekly_debriefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  performance_summary text NOT NULL,
  top_strength text NOT NULL,
  top_weakness text NOT NULL,
  pattern_analysis text NOT NULL,
  rule_violations text NOT NULL,
  next_week_focus text NOT NULL,
  position_sizing_recommendation text NOT NULL,
  source_stats jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX weekly_debriefs_user_week_idx ON public.weekly_debriefs (user_id, week_start DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_debriefs TO authenticated;
GRANT ALL ON public.weekly_debriefs TO service_role;

ALTER TABLE public.weekly_debriefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own weekly debriefs"
  ON public.weekly_debriefs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_weekly_debriefs_updated_at
  BEFORE UPDATE ON public.weekly_debriefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();