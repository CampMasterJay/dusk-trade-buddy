
CREATE TABLE public.setup_health_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  setup_type text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  all_time_win_rate numeric NOT NULL,
  recent_win_rate numeric NOT NULL,
  recent_sample_size integer NOT NULL DEFAULT 20,
  action_taken text NOT NULL DEFAULT 'Reviewed'
    CHECK (action_taken IN ('Paused','Continued','Reviewed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.setup_health_log TO authenticated;
GRANT ALL ON public.setup_health_log TO service_role;

ALTER TABLE public.setup_health_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own setup health log"
  ON public.setup_health_log
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX setup_health_log_user_setup_idx
  ON public.setup_health_log (user_id, setup_type, detected_at DESC);

CREATE TRIGGER update_setup_health_log_updated_at
  BEFORE UPDATE ON public.setup_health_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
