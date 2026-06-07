import { supabase } from "@/integrations/supabase/client";

export type SkillAxis =
  | "Win Rate"
  | "R:R Discipline"
  | "Risk Management"
  | "Setup Selectivity"
  | "Behavioral Discipline"
  | "Consistency"
  | "Regime Adaptation"
  | "Exit Quality";

export type SkillScores = Record<SkillAxis, number>;

type TradeRow = {
  id: string;
  date: string;
  created_at: string;
  result: string | null;
  pnl: number | null;
  r_multiple: number | null;
  max_favorable_excursion_points: number | null;
  stop_distance_points: number | null;
  market_regime: string | null;
  playbook_score: string | null;
  was_revenge_trade: boolean | null;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

export function scoreSkills(trades: TradeRow[], plannedRR = 1.5): SkillScores {
  const decided = trades.filter((t) => t.result === "Win" || t.result === "Loss");
  const wr = decided.length
    ? decided.filter((t) => t.result === "Win").length / decided.length
    : 0;

  // R:R Discipline — avg actual R / planned R
  const rs = decided.map((t) => Number(t.r_multiple ?? 0));
  const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  const rrScore = clamp01((avgR / Math.max(0.5, plannedRR)) * 50 + 50);

  // Risk Management — % of days where daily P&L >= -daily_max_loss (proxy: no day < -2x avg loss)
  const byDay = new Map<string, number>();
  for (const t of trades) {
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + Number(t.pnl ?? 0));
  }
  const dayPnls = [...byDay.values()];
  const losses = dayPnls.filter((p) => p < 0).map((p) => Math.abs(p));
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const cap = avgLoss * 2 || 1;
  const goodDays = dayPnls.filter((p) => p > -cap).length;
  const riskScore = dayPnls.length ? (goodDays / dayPnls.length) * 100 : 50;

  // Setup Selectivity — A+ match rate
  const tagged = trades.filter((t) => t.playbook_score);
  const aplus = tagged.filter((t) => t.playbook_score === "A+ Match").length;
  const selScore = tagged.length ? (aplus / tagged.length) * 100 : 40;

  // Behavioral Discipline — 100 - revenge %
  const revenge = trades.filter((t) => t.was_revenge_trade).length;
  const behScore = trades.length ? clamp01(100 - (revenge / trades.length) * 200) : 70;

  // Consistency — inverse of normalized stdev of daily P&L
  const sd = stdev(dayPnls);
  const mean = dayPnls.length
    ? Math.abs(dayPnls.reduce((a, b) => a + b, 0) / dayPnls.length)
    : 0;
  const cv = mean > 0 ? sd / mean : sd > 0 ? 2 : 0;
  const consScore = clamp01(100 - Math.min(100, cv * 30));

  // Regime Adaptation — avg WR across regimes, penalize variance
  const regimeWR = new Map<string, { w: number; n: number }>();
  for (const t of decided) {
    if (!t.market_regime) continue;
    const r = regimeWR.get(t.market_regime) ?? { w: 0, n: 0 };
    r.n += 1;
    if (t.result === "Win") r.w += 1;
    regimeWR.set(t.market_regime, r);
  }
  const wrs = [...regimeWR.values()].filter((v) => v.n >= 3).map((v) => v.w / v.n);
  let regScore = 50;
  if (wrs.length) {
    const m = wrs.reduce((a, b) => a + b, 0) / wrs.length;
    const spread = Math.max(...wrs) - Math.min(...wrs);
    regScore = clamp01(m * 100 - spread * 30);
  }

  // Exit Quality — actual R / (MFE / stop_distance) ratio
  const wins = decided.filter((t) => t.result === "Win");
  const ratios: number[] = [];
  for (const t of wins) {
    const mfe = Number(t.max_favorable_excursion_points ?? 0);
    const stop = Number(t.stop_distance_points ?? 0);
    if (mfe > 0 && stop > 0) {
      const mfeR = mfe / stop;
      if (mfeR > 0) ratios.push(Math.min(1.2, Number(t.r_multiple ?? 0) / mfeR));
    }
  }
  const exitScore = ratios.length
    ? clamp01((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)
    : 50;

  return {
    "Win Rate": clamp01(wr * 100),
    "R:R Discipline": clamp01(rrScore),
    "Risk Management": clamp01(riskScore),
    "Setup Selectivity": clamp01(selScore),
    "Behavioral Discipline": clamp01(behScore),
    "Consistency": clamp01(consScore),
    "Regime Adaptation": clamp01(regScore),
    "Exit Quality": clamp01(exitScore),
  };
}

export async function fetchSkillTrades(): Promise<TradeRow[]> {
  const { data } = await supabase
    .from("trades")
    .select(
      "id,date,created_at,result,pnl,r_multiple,max_favorable_excursion_points,stop_distance_points,market_regime,playbook_score,was_revenge_trade",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown) as TradeRow[];
}

export function partitionByCutoff(
  trades: TradeRow[],
  daysAgo: number,
): { older: TradeRow[]; current: TradeRow[] } {
  const cutoff = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  const older: TradeRow[] = [];
  const current: TradeRow[] = [];
  for (const t of trades) {
    if (new Date(t.created_at).getTime() < cutoff) older.push(t);
    current.push(t);
  }
  return { older, current };
}