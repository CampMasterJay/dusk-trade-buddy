import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

export type PropFirmConstraints = {
  loading: boolean;
  hasActiveChallenge: boolean;
  firmName: string | null;
  accountSize: number | null;
  drawdownType: string | null;
  /** Remaining $ before account termination (drawdown breach). */
  drawdownRemaining: number;
  maxDrawdown: number;
  drawdownUsed: number;
  /** Remaining $ before daily-loss breach today. null = firm has no daily limit. */
  dailyLossRemaining: number | null;
  maxDailyLoss: number | null;
  dailyLossUsed: number;
  /** Today's realized PnL (America/Chicago). */
  todayPnl: number;
  profitTargetReached: boolean;
  profitTarget: number;
  pnl: number;
  /** Lock the New Trade flow entirely. */
  locked: boolean;
  lockReason: string | null;
  /** Reload after a trade is logged. */
  refresh: () => Promise<void>;
};

const DEFAULT: PropFirmConstraints = {
  loading: true,
  hasActiveChallenge: false,
  firmName: null,
  accountSize: null,
  drawdownType: null,
  drawdownRemaining: 0,
  maxDrawdown: 0,
  drawdownUsed: 0,
  dailyLossRemaining: null,
  maxDailyLoss: null,
  dailyLossUsed: 0,
  todayPnl: 0,
  profitTargetReached: false,
  profitTarget: 0,
  pnl: 0,
  locked: false,
  lockReason: null,
  refresh: async () => {},
};

export function usePropFirmConstraints(): PropFirmConstraints {
  const { user } = useAuth();
  const [state, setState] = useState<PropFirmConstraints>(DEFAULT);

  const load = useCallback(async () => {
    if (!user) {
      setState({ ...DEFAULT, loading: false, refresh: load });
      return;
    }
    // Most recently created active "In Challenge" account is the current account.
    const { data: accountRow } = await supabase
      .from("prop_firm_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("status", "In Challenge")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!accountRow) {
      setState({ ...DEFAULT, loading: false, refresh: load });
      return;
    }

    const { data: firm } = await supabase
      .from("prop_firms")
      .select("*")
      .eq("id", accountRow.prop_firm_id)
      .maybeSingle();
    if (!firm) {
      setState({ ...DEFAULT, loading: false, refresh: load });
      return;
    }

    const starting = Number(accountRow.starting_balance);
    const current = Number(accountRow.current_balance);
    const peak = Number(accountRow.peak_balance ?? starting);

    const profitTarget =
      Number(firm.profit_target_amount) ||
      (firm.profit_target_pct != null
        ? starting * (Number(firm.profit_target_pct) / 100)
        : 0);
    const maxDailyLoss: number | null =
      firm.max_daily_loss_amount != null
        ? Number(firm.max_daily_loss_amount)
        : firm.max_daily_loss_pct != null
          ? starting * (Number(firm.max_daily_loss_pct) / 100)
          : null;
    const maxDrawdown =
      Number(firm.max_drawdown_amount) ||
      (firm.max_drawdown_pct != null
        ? starting * (Number(firm.max_drawdown_pct) / 100)
        : 0);

    const ddRef =
      firm.drawdown_type === "static" ? starting : Math.max(peak, starting);
    const drawdownUsed = Math.max(0, ddRef - current);
    const drawdownRemaining = Math.max(0, maxDrawdown - drawdownUsed);

    // Today's realized PnL (CT)
    const ctToday = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Chicago",
    });
    const { data: trades } = await supabase
      .from("trades")
      .select("pnl")
      .eq("user_id", user.id)
      .eq("date", ctToday)
      .is("deleted_at", null);
    const todayPnl = (trades ?? []).reduce(
      (s, t) => s + (Number(t.pnl) || 0),
      0,
    );
    const dailyLossUsed = todayPnl < 0 ? Math.abs(todayPnl) : 0;
    const dailyLossRemaining =
      maxDailyLoss != null ? Math.max(0, maxDailyLoss - dailyLossUsed) : null;

    const pnl = current - starting;
    const profitTargetReached = profitTarget > 0 && pnl >= profitTarget;

    let locked = false;
    let lockReason: string | null = null;
    if (drawdownRemaining < 500 && maxDrawdown > 0) {
      locked = true;
      lockReason = `STOP — You have ${fmt(drawdownRemaining)} left before account termination. Do not trade. Review your rules.`;
    } else if (maxDailyLoss != null && dailyLossUsed >= maxDailyLoss) {
      locked = true;
      lockReason = `STOP — Daily loss limit of ${fmt(maxDailyLoss)} hit. Resume tomorrow.`;
    } else if (profitTargetReached) {
      locked = true;
      lockReason = `CHALLENGE COMPLETE — Profit target reached. Stop trading and submit for funded evaluation.`;
    }

    setState({
      loading: false,
      hasActiveChallenge: true,
      firmName: firm.firm_name,
      accountSize: Number(firm.account_size),
      drawdownType: firm.drawdown_type,
      drawdownRemaining,
      maxDrawdown,
      drawdownUsed,
      dailyLossRemaining,
      maxDailyLoss,
      dailyLossUsed,
      todayPnl,
      profitTargetReached,
      profitTarget,
      pnl,
      locked,
      lockReason,
      refresh: load,
    });
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return state;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

/**
 * Cap contracts so a full-stop loss cannot exceed the smaller of
 * (daily-loss remaining, drawdown remaining).
 */
export function maxContractsForStop(
  stopDistancePoints: number,
  tickValuePerPoint: number,
  constraints: PropFirmConstraints,
): { max: number; bindingLimit: number; binding: "daily" | "drawdown" } | null {
  if (!constraints.hasActiveChallenge) return null;
  if (!stopDistancePoints || stopDistancePoints <= 0) return null;
  if (!tickValuePerPoint || tickValuePerPoint <= 0) return null;

  const lossPerContract = stopDistancePoints * tickValuePerPoint;
  if (lossPerContract <= 0) return null;

  const candidates: Array<{ amount: number; kind: "daily" | "drawdown" }> = [
    { amount: constraints.drawdownRemaining, kind: "drawdown" },
  ];
  if (constraints.dailyLossRemaining != null) {
    candidates.push({
      amount: constraints.dailyLossRemaining,
      kind: "daily",
    });
  }
  const binding = candidates.reduce((a, b) => (a.amount < b.amount ? a : b));
  const max = Math.max(0, Math.floor(binding.amount / lossPerContract));
  return { max, bindingLimit: binding.amount, binding: binding.kind };
}