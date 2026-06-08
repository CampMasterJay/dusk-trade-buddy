import { supabase } from "@/integrations/supabase/client";

export type OptionsStatRow = {
  id: string;
  trade_date: string;
  updated_at: string;
  status: string;
  underlying: string;
  strategy_type: string;
  is_debit: boolean;
  direction_bias: string | null;
  leg1_contracts: number;
  underlying_price_at_entry: number | null;
  underlying_price_at_exit: number | null;
  iv_rank_at_entry: number | null;
  entry_delta: number | null;
  entry_gamma: number | null;
  entry_theta: number | null;
  entry_vega: number | null;
  dte_at_entry: number | null;
  planned_exit_dte: number | null;
  max_risk: number | null;
  max_profit: number | null;
  net_pnl: number | null;
  premium_paid_or_received: number | null;
  is_earnings_play?: boolean | null;
};

export type PnLAttribution = {
  directionPnL: number;
  thetaPnL: number;
  vegaPnL: number; // residual
  daysHeld: number;
};

const CLOSED_STATUSES = new Set(["Closed", "Expired", "Assigned"]);

export function isClosed(row: Pick<OptionsStatRow, "status">): boolean {
  return CLOSED_STATUSES.has(row.status);
}

export function daysBetween(start: string, end: string): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!isFinite(a) || !isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Estimate the contribution of underlying direction, time decay, and
 * volatility to the realized net P&L of a closed options trade.
 *
 * Simplifications (entry greeks only):
 *  - direction = entry_delta × ΔUnderlying × 100 × contracts
 *  - theta     = entry_theta × contracts × daysHeld
 *  - vega      = residual (net P&L − direction − theta)
 */
export function attributePnL(row: OptionsStatRow): PnLAttribution | null {
  if (!isClosed(row) || row.net_pnl == null) return null;
  const contracts = Math.max(1, Number(row.leg1_contracts) || 1);
  const daysHeld = daysBetween(row.trade_date, row.updated_at);

  const entryPx = Number(row.underlying_price_at_entry);
  const exitPx = Number(row.underlying_price_at_exit);
  const delta = Number(row.entry_delta);
  const direction =
    Number.isFinite(entryPx) &&
    Number.isFinite(exitPx) &&
    Number.isFinite(delta)
      ? delta * (exitPx - entryPx) * 100 * contracts
      : 0;

  const theta = Number(row.entry_theta);
  // entry_theta is per-day per-contract dollar decay. For a long (debit) it is
  // typically negative (you lose), for a short (credit) typically positive.
  const thetaPnL = Number.isFinite(theta) ? theta * contracts * daysHeld : 0;

  const residual = (row.net_pnl ?? 0) - direction - thetaPnL;

  return {
    directionPnL: direction,
    thetaPnL,
    vegaPnL: residual,
    daysHeld,
  };
}

export type OptionsAggregateStats = {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1
  avgWinnerPctOfMaxProfit: number; // 0..1
  avgLoserPctOfMaxRisk: number; // 0..1
  avgDteAtEntry: number;
  avgDteAtExit: number; // dte_at_entry - daysHeld
  mostProfitableStrategy: { name: string; netPnL: number } | null;
  highestWinRateStrategy: { name: string; winRate: number; n: number } | null;
  avgIvrAtEntry: number | null;
  thetaHarvestedCredits: number; // sum of positive theta contribution on credit trades
  thetaPaidDebits: number; // sum of negative theta contribution on debit trades (absolute)
  todayThetaDecay: number; // $/day from currently open positions (sum entry_theta × contracts)
  cumulativeThetaAttribution: number; // sum of thetaPnL across all closed trades (signed)
};

export function aggregateOptionsStats(rows: OptionsStatRow[]): OptionsAggregateStats {
  const open = rows.filter((r) => r.status === "Open");
  const closed = rows.filter(isClosed);
  const winsArr = closed.filter((r) => (r.net_pnl ?? 0) > 0);
  const lossArr = closed.filter((r) => (r.net_pnl ?? 0) < 0);

  const winPctsOfMax = winsArr
    .map((r) => {
      const mp = Number(r.max_profit);
      if (!isFinite(mp) || mp <= 0) return null;
      return Math.min(1, (r.net_pnl ?? 0) / mp);
    })
    .filter((v): v is number => v != null);

  const lossPctsOfRisk = lossArr
    .map((r) => {
      const mr = Number(r.max_risk);
      if (!isFinite(mr) || mr <= 0) return null;
      return Math.min(1, Math.abs(r.net_pnl ?? 0) / mr);
    })
    .filter((v): v is number => v != null);

  const dtesIn = closed
    .map((r) => Number(r.dte_at_entry))
    .filter((v) => isFinite(v));
  const dtesOut = closed
    .map((r) => {
      const dte = Number(r.dte_at_entry);
      if (!isFinite(dte)) return null;
      const held = daysBetween(r.trade_date, r.updated_at);
      return Math.max(0, dte - held);
    })
    .filter((v): v is number => v != null);

  // Strategy breakdown
  const byStrat = new Map<
    string,
    { netPnL: number; n: number; wins: number }
  >();
  for (const r of closed) {
    const s = r.strategy_type || "Other";
    const cur = byStrat.get(s) ?? { netPnL: 0, n: 0, wins: 0 };
    cur.netPnL += r.net_pnl ?? 0;
    cur.n += 1;
    if ((r.net_pnl ?? 0) > 0) cur.wins += 1;
    byStrat.set(s, cur);
  }
  let mostProfit: { name: string; netPnL: number } | null = null;
  let bestWR: { name: string; winRate: number; n: number } | null = null;
  for (const [name, v] of byStrat) {
    if (!mostProfit || v.netPnL > mostProfit.netPnL)
      mostProfit = { name, netPnL: v.netPnL };
    if (v.n >= 3) {
      const wr = v.wins / v.n;
      if (!bestWR || wr > bestWR.winRate) bestWR = { name, winRate: wr, n: v.n };
    }
  }

  const ivrs = closed
    .map((r) => Number(r.iv_rank_at_entry))
    .filter((v) => isFinite(v));
  const avgIvr = ivrs.length > 0 ? ivrs.reduce((s, v) => s + v, 0) / ivrs.length : null;

  // Theta attribution totals
  let thetaHarvested = 0;
  let thetaPaid = 0;
  let cumulativeTheta = 0;
  for (const r of closed) {
    const a = attributePnL(r);
    if (!a) continue;
    cumulativeTheta += a.thetaPnL;
    if (!r.is_debit && a.thetaPnL > 0) thetaHarvested += a.thetaPnL;
    if (r.is_debit && a.thetaPnL < 0) thetaPaid += Math.abs(a.thetaPnL);
  }

  // Today's theta = sum across open positions of (entry_theta × contracts)
  const todayTheta = open.reduce((s, r) => {
    const t = Number(r.entry_theta);
    const c = Math.max(1, Number(r.leg1_contracts) || 1);
    return s + (isFinite(t) ? t * c : 0);
  }, 0);

  return {
    totalTrades: rows.length,
    openTrades: open.length,
    closedTrades: closed.length,
    wins: winsArr.length,
    losses: lossArr.length,
    winRate: closed.length > 0 ? winsArr.length / closed.length : 0,
    avgWinnerPctOfMaxProfit:
      winPctsOfMax.length > 0
        ? winPctsOfMax.reduce((s, v) => s + v, 0) / winPctsOfMax.length
        : 0,
    avgLoserPctOfMaxRisk:
      lossPctsOfRisk.length > 0
        ? lossPctsOfRisk.reduce((s, v) => s + v, 0) / lossPctsOfRisk.length
        : 0,
    avgDteAtEntry:
      dtesIn.length > 0 ? dtesIn.reduce((s, v) => s + v, 0) / dtesIn.length : 0,
    avgDteAtExit:
      dtesOut.length > 0 ? dtesOut.reduce((s, v) => s + v, 0) / dtesOut.length : 0,
    mostProfitableStrategy: mostProfit,
    highestWinRateStrategy: bestWR,
    avgIvrAtEntry: avgIvr,
    thetaHarvestedCredits: thetaHarvested,
    thetaPaidDebits: thetaPaid,
    todayThetaDecay: todayTheta,
    cumulativeThetaAttribution: cumulativeTheta,
  };
}

export async function fetchOptionsStatRows(userId: string): Promise<OptionsStatRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("options_trades")
    .select(
      "id, trade_date, updated_at, status, underlying, strategy_type, is_debit, direction_bias, leg1_contracts, underlying_price_at_entry, underlying_price_at_exit, iv_rank_at_entry, entry_delta, entry_gamma, entry_theta, entry_vega, dte_at_entry, planned_exit_dte, max_risk, max_profit, net_pnl, premium_paid_or_received",
    )
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) throw error;
  return (data ?? []) as OptionsStatRow[];
}