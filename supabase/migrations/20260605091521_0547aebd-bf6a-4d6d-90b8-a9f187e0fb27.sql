CREATE TABLE public.trade_journals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id UUID NOT NULL,
  user_id UUID NOT NULL,
  pre_thoughts TEXT,
  execution_quality SMALLINT CHECK (execution_quality BETWEEN 1 AND 5),
  emotion TEXT CHECK (emotion IN ('Calm','Confident','Anxious','Impatient','Revenge','FOMO')),
  post_reflection TEXT,
  would_repeat BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_journals TO authenticated;
GRANT ALL ON public.trade_journals TO service_role;

ALTER TABLE public.trade_journals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own trade journals"
ON public.trade_journals FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX trade_journals_user_id_idx ON public.trade_journals(user_id);
CREATE INDEX trade_journals_trade_id_idx ON public.trade_journals(trade_id);

CREATE TRIGGER update_trade_journals_updated_at
BEFORE UPDATE ON public.trade_journals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();