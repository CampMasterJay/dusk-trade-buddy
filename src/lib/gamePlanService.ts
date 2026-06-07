import { supabase } from "@/integrations/supabase/client";
import type { Trade } from "@/lib/tradeService";
import type { MarketRegime } from "@/lib/marketRegime";

export type Bias = "Bullish" | "Bearish" | "Neutral";

export interface GamePlan {
  id: string;
  user_id: string;
  plan_date: string; // YYYY-MM-DD
  bias: Bias;
  key_levels: number[];
  planned_setups: string[];
  max_trades: number;
  max_loss: number | null;
  notes: string | null;
  market_regime: MarketRegime | null;
  discipline_score: number | null;
  stuck_to_max_trades: boolean | null;
  stayed_within_loss: boolean | null;
  traded_planned_setups: boolean | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GamePlanInput {
  plan_date: string;
  bias: Bias;
  key_levels: number[];
  planned_setups: string[];
  max_trades: number;
  max_loss: number | null;
  notes: string | null;
  market_regime: MarketRegime | null;
}

export function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getPlanForDate(
  userId: string,
  date: string,
): Promise<{ data: GamePlan | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("daily_game_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", date)
    .maybeSingle();
  return { data: (data as GamePlan | null) ?? null, error: (error as Error | null) ?? null };
}

export async function getRecentPlans(
  userId: string,
  limit = 60,
): Promise<{ data: GamePlan[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("daily_game_plans")
    .select("*")
    .eq("user_id", userId)
    .order("plan_date", { ascending: false })
    .limit(limit);
  return { data: (data as GamePlan[] | null) ?? [], error: (error as Error | null) ?? null };
}

export async function upsertPlan(
  userId: string,
  input: GamePlanInput,
): Promise<{ data: GamePlan | null; error: Error | null }> {
  const payload = { ...input, user_id: userId };
  const { data, error } = await supabase
    .from("daily_game_plans")
    .upsert(payload, { onConflict: "user_id,plan_date" })
    .select("*")
    .single();
  return { data: (data as GamePlan | null) ?? null, error: (error as Error | null) ?? null };
}

export async function saveReview(
  planId: string,
  review: {
    stuck_to_max_trades: boolean;
    stayed_within_loss: boolean;
    traded_planned_setups: boolean;
    discipline_score: number;
  },
): Promise<{ data: GamePlan | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("daily_game_plans")
    .update({ ...review, reviewed_at: new Date().toISOString() })
    .eq("id", planId)
    .select("*")
    .single();
  return { data: (data as GamePlan | null) ?? null, error: (error as Error | null) ?? null };
}

export interface PlanReview {
  stuck_to_max_trades: boolean;
  stayed_within_loss: boolean;
  traded_planned_setups: boolean;
  discipline_score: number; // 0..3
  actualTrades: number;
  actualLoss: number; // absolute $ lost (positive number)
  unplannedSetups: string[];
}

/**
 * Compare a plan against the trades placed on that plan's date.
 * `trades` should be the user's trades; this function filters to the plan date.
 */
export function computeReview(plan: GamePlan, trades: Trade[]): PlanReview {
  const dayTrades = trades.filter((t) => String(t.date).slice(0, 10) === plan.plan_date);
  const actualTrades = dayTrades.length;

  const totalPnl = dayTrades.reduce((s, t) => s + Number(t.pnl ?? 0), 0);
  const actualLoss = totalPnl < 0 ? Math.abs(totalPnl) : 0;

  const stuck_to_max_trades = actualTrades <= plan.max_trades;
  const stayed_within_loss =
    plan.max_loss == null ? true : actualLoss <= Number(plan.max_loss);

  // If the user planned setups, ensure every taken trade's setup_tag is in the plan
  const planned = new Set(plan.planned_setups);
  const unplannedSetups: string[] = [];
  if (planned.size > 0) {
    for (const t of dayTrades) {
      const tag = (t as { setup_tag?: string | null }).setup_tag;
      if (tag && !planned.has(tag)) unplannedSetups.push(tag);
    }
  }
  // If no trades, treat as "stayed on plan" (no deviation)
  const traded_planned_setups = unplannedSetups.length === 0;

  const discipline_score =
    (stuck_to_max_trades ? 1 : 0) +
    (stayed_within_loss ? 1 : 0) +
    (traded_planned_setups ? 1 : 0);

  return {
    stuck_to_max_trades,
    stayed_within_loss,
    traded_planned_setups,
    discipline_score,
    actualTrades,
    actualLoss,
    unplannedSetups: Array.from(new Set(unplannedSetups)),
  };
}

/**
 * Compute current consistency streak: number of consecutive most-recent
 * reviewed plan-days where discipline_score === 3.
 */
export function computeConsistencyStreak(plans: GamePlan[]): {
  current: number;
  best: number;
} {
  // Sort by date desc
  const sorted = [...plans]
    .filter((p) => p.discipline_score != null)
    .sort((a, b) => (a.plan_date < b.plan_date ? 1 : -1));
  let current = 0;
  for (const p of sorted) {
    if ((p.discipline_score ?? 0) === 3) current += 1;
    else break;
  }
  // Best streak across history
  const chrono = [...sorted].reverse();
  let best = 0;
  let run = 0;
  for (const p of chrono) {
    if ((p.discipline_score ?? 0) === 3) {
      run += 1;
      if (run > best) best = run;
    } else run = 0;
  }
  return { current, best };
}