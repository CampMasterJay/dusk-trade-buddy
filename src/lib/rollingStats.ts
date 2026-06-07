import type { Trade } from "@/lib/tradeService";

export type RollingWindow = 10 | 20 | 50 | "all";

export interface RollingMetrics {
  window: RollingWindow;
  sample: number;
  winRate: number; // 0..1 (decisive only)
  avgR: number;
  ev: number; // $/trade
  netPnl: number;
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

/**
 * Compute rolling stats for the most recent N trades.
 * Expects `trades` ordered newest-first (matches getTrades default).
 */
export function rollingStats(trades: Trade[], window: RollingWindow): RollingMetrics {
  const slice =
    window === "all" ? trades.slice() : trades.slice(0, window);

  const decisive = slice.filter((t) => t.result === "Win" || t.result === "Loss");
  const wins = decisive.filter((t) => t.result === "Win").length;
  const losses = decisive.filter((t) => t.result === "Loss").length;
  const winRate = decisive.length > 0 ? wins / decisive.length : 0;

  const rs = slice
    .map((t) => num(t.r_multiple))
    .filter((n) => Number.isFinite(n));
  const avgR = rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;

  const netPnl = slice.reduce((a, t) => a + num(t.pnl), 0);

  const winsPnl = slice.filter((t) => t.result === "Win").map((t) => num(t.pnl));
  const lossesPnl = slice.filter((t) => t.result === "Loss").map((t) => num(t.pnl));
  const avgWin =
    winsPnl.length > 0 ? winsPnl.reduce((a, b) => a + b, 0) / winsPnl.length : 0;
  const avgLoss =
    lossesPnl.length > 0 ? lossesPnl.reduce((a, b) => a + b, 0) / lossesPnl.length : 0;
  const ev =
    decisive.length > 0
      ? (wins / decisive.length) * avgWin + (losses / decisive.length) * avgLoss
      : 0;

  return { window, sample: slice.length, winRate, avgR, ev, netPnl };
}

export const ROLLING_WINDOWS: RollingWindow[] = [10, 20, 50, "all"];

export function allRollingStats(trades: Trade[]): RollingMetrics[] {
  return ROLLING_WINDOWS.map((w) => rollingStats(trades, w));
}

/** Relative comparison to baseline, returns tone per cell. */
export type CellTone = "green" | "red" | "neutral";

/** Pct delta relative to baseline. For 0 baseline, returns 0 when value is 0, else 1. */
function relDelta(value: number, baseline: number): number {
  if (baseline === 0) return value === 0 ? 0 : 1;
  return (value - baseline) / Math.abs(baseline);
}

export function toneForCell(value: number, baseline: number): CellTone {
  const delta = relDelta(value, baseline);
  if (Math.abs(delta) <= 0.05) return "neutral";
  return delta > 0 ? "green" : "red";
}

// ---------------- Edge Health ----------------

export type EdgeHealthStatus =
  | "EDGE STABLE"
  | "EDGE SOFTENING"
  | "EDGE DEGRADING"
  | "EDGE IMPROVING"
  | "INSUFFICIENT DATA";

export interface EdgeHealth {
  status: EdgeHealthStatus;
  tone: "green" | "amber" | "red" | "muted";
  recent: number; // last-20 win rate (0..1)
  baseline: number; // all-time win rate (0..1)
  deltaPct: number; // absolute pct point delta (recent - baseline) * 100
  recentSample: number;
  baselineSample: number;
  message: string;
}

export function edgeHealth(trades: Trade[]): EdgeHealth {
  const last20 = rollingStats(trades, 20);
  const all = rollingStats(trades, "all");
  const recentSample = trades.slice(0, 20).filter(
    (t) => t.result === "Win" || t.result === "Loss",
  ).length;
  const baselineSample = trades.filter(
    (t) => t.result === "Win" || t.result === "Loss",
  ).length;

  if (recentSample < 10 || baselineSample < 20) {
    return {
      status: "INSUFFICIENT DATA",
      tone: "muted",
      recent: last20.winRate,
      baseline: all.winRate,
      deltaPct: 0,
      recentSample,
      baselineSample,
      message: `Need at least 10 recent and 20 all-time decisive trades — currently ${recentSample}/${baselineSample}.`,
    };
  }

  const deltaPct = (last20.winRate - all.winRate) * 100;

  if (deltaPct >= 10) {
    return {
      status: "EDGE IMPROVING",
      tone: "green",
      recent: last20.winRate,
      baseline: all.winRate,
      deltaPct,
      recentSample,
      baselineSample,
      message: "Current conditions suit your style.",
    };
  }
  if (deltaPct <= -15) {
    return {
      status: "EDGE DEGRADING",
      tone: "red",
      recent: last20.winRate,
      baseline: all.winRate,
      deltaPct,
      recentSample,
      baselineSample,
      message: "Stop and audit setups.",
    };
  }
  if (deltaPct <= -5) {
    return {
      status: "EDGE SOFTENING",
      tone: "amber",
      recent: last20.winRate,
      baseline: all.winRate,
      deltaPct,
      recentSample,
      baselineSample,
      message: "Review recent trades.",
    };
  }
  return {
    status: "EDGE STABLE",
    tone: "green",
    recent: last20.winRate,
    baseline: all.winRate,
    deltaPct,
    recentSample,
    baselineSample,
    message: "Performance is holding near your long-term baseline.",
  };
}