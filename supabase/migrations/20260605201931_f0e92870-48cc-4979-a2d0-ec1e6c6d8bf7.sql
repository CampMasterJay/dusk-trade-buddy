ALTER TABLE public.chart_analyses
  ADD COLUMN IF NOT EXISTS feedback_rating text,
  ADD COLUMN IF NOT EXISTS feedback_note text;