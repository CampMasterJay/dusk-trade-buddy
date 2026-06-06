import type { TradeStats } from "@/lib/tradeService";

export type TradeStatsInput = {
  result: string | null;
  pnl: number | string | null;
  r_multiple: number | string | null;
};

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

/**
 * Pure computation of aggregate trade stats. Decoupled from Supabase so it
 * can be unit-tested without network or auth.
 */
export function computeTradeStats(rows: TradeStatsInput[]): TradeStats {
  const winTrades = rows.filter((t) => t.result === "Win");
  const lossTrades = rows.filter((t) => t.result === "Loss");

  const wins = winTrades.length;
  const losses = lossTrades.length;
  const totalTrades = rows.length;
  const decided = wins + losses;
  const winRate = decided > 0 ? wins / decided : 0;

  const totalPnl = rows.reduce((a, t) => a + num(t.pnl), 0);
  const totalR = rows.reduce((a, t) => a + num(t.r_multiple), 0);

  const winsPnl = winTrades.map((t) => num(t.pnl));
  const lossesPnl = lossTrades.map((t) => num(t.pnl));

  const avgWin = winsPnl.length > 0 ? winsPnl.reduce((a, b) => a + b, 0) / winsPnl.length : 0;
  const avgLoss =
    lossesPnl.length > 0 ? lossesPnl.reduce((a, b) => a + b, 0) / lossesPnl.length : 0;

  const ev = decided > 0 ? (wins / decided) * avgWin + (losses / decided) * avgLoss : 0;

  const allPnl = rows.map((t) => num(t.pnl));
  const largestWin = allPnl.length > 0 ? Math.max(0, ...allPnl) : 0;
  const largestLoss = allPnl.length > 0 ? Math.min(0, ...allPnl) : 0;

  return {
    totalTrades,
    wins,
    losses,
    winRate,
    totalPnl,
    avgWin,
    avgLoss,
    ev,
    totalR,
    largestWin,
    largestLoss,
  };
}