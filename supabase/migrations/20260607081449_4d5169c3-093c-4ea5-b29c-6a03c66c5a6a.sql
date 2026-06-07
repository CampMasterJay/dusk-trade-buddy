
CREATE TABLE public.options_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  trade_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Closed','Expired','Assigned')),

  -- Underlying
  underlying text NOT NULL,
  underlying_price_at_entry numeric,
  underlying_price_at_exit numeric,
  market_type text NOT NULL DEFAULT 'equity_option' CHECK (market_type IN ('equity_option','futures_option')),

  -- Strategy
  strategy_type text NOT NULL,
  direction_bias text CHECK (direction_bias IN ('Bullish','Bearish','Neutral','Volatility')),
  is_debit boolean NOT NULL DEFAULT true,
  is_0dte boolean NOT NULL DEFAULT false,

  -- Leg 1
  leg1_type text NOT NULL CHECK (leg1_type IN ('Call','Put')),
  leg1_action text NOT NULL CHECK (leg1_action IN ('Buy','Sell')),
  leg1_strike numeric NOT NULL,
  leg1_expiration date NOT NULL,
  leg1_premium numeric NOT NULL,
  leg1_contracts integer NOT NULL DEFAULT 1,
  leg1_delta_at_entry numeric,
  leg1_iv_at_entry numeric,

  -- Leg 2 (optional)
  leg2_type text CHECK (leg2_type IN ('Call','Put')),
  leg2_action text CHECK (leg2_action IN ('Buy','Sell')),
  leg2_strike numeric,
  leg2_expiration date,
  leg2_premium numeric,
  leg2_contracts integer,
  leg2_delta_at_entry numeric,
  leg2_iv_at_entry numeric,

  -- P&L
  premium_paid_or_received numeric,
  max_risk numeric,
  max_profit numeric,
  break_even_price numeric,
  exit_premium numeric,
  gross_pnl numeric,
  commission_total numeric NOT NULL DEFAULT 0,
  net_pnl numeric,

  -- Risk management
  dte_at_entry integer,
  iv_rank_at_entry numeric,
  planned_exit_dte integer,
  planned_profit_target_pct numeric,
  planned_stop_loss_pct numeric,
  actual_exit_reason text CHECK (actual_exit_reason IN ('Target','Stop','Expiration','Assignment','Manual','Other')),

  -- Greeks
  entry_delta numeric,
  entry_gamma numeric,
  entry_theta numeric,
  entry_vega numeric,

  -- Journal
  notes text,
  checklist_score integer,
  emotion text,
  deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.options_trades TO authenticated;
GRANT ALL ON public.options_trades TO service_role;

ALTER TABLE public.options_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own options trades"
  ON public.options_trades FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX options_trades_user_date_idx ON public.options_trades (user_id, trade_date DESC);
CREATE INDEX options_trades_user_status_idx ON public.options_trades (user_id, status);

CREATE TRIGGER update_options_trades_updated_at
  BEFORE UPDATE ON public.options_trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
