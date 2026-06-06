import { supabase } from "@/integrations/supabase/client";

export type PerfMetric =
  | "app_load"
  | "ai_chart_analysis"
  | "ai_news_impact"
  | "news_fetch"
  | "db_get_trades"
  | "db_get_trade_stats";

/**
 * Fire-and-forget perf logging. Never throws. Safe to call from any client code.
 * Skips silently when the user isn't signed in or duration is negative.
 */
export async function logPerf(
  metric: PerfMetric,
  durationMs: number,
  opts: { tokensUsed?: number | null; meta?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.from("performance_logs").insert({
      user_id: userId,
      metric,
      duration_ms: Math.round(durationMs),
      tokens_used: opts.tokensUsed ?? null,
      meta: (opts.meta ?? null) as never,
    });
  } catch {
    // swallow — perf logging must never break the app
  }
}

/** Wrap an async fn and log its wall-clock duration. Returns whatever the fn returns. */
export async function withTiming<T>(
  metric: PerfMetric,
  fn: () => Promise<T>,
  opts: { tokensFrom?: (result: T) => number | null | undefined; meta?: Record<string, unknown> } = {},
): Promise<T> {
  const start = performance.now();
  let ok = true;
  let result: T;
  try {
    result = await fn();
    return result;
  } catch (e) {
    ok = false;
    throw e;
  } finally {
    const dur = performance.now() - start;
    const tokens =
      ok && opts.tokensFrom && result! !== undefined ? opts.tokensFrom(result!) ?? null : null;
    void logPerf(metric, dur, { tokensUsed: tokens, meta: { ok, ...(opts.meta ?? {}) } });
  }
}

/** Blended estimate for Gemini 2.5 Flash via Lovable AI Gateway. */
export const COST_PER_1K_TOKENS = 0.0005; // USD
export const MONTHLY_COST_ALERT_USD = 5;

export function estimateCostUsd(totalTokens: number): number {
  return (totalTokens / 1000) * COST_PER_1K_TOKENS;
}

export type PerfStats = {
  avgAiResponseMs: number;
  aiCallCountMonth: number;
  totalApiCallsMonth: number;
  totalTokensMonth: number;
  estCostUsdMonth: number;
};

const AI_METRICS: PerfMetric[] = ["ai_chart_analysis", "ai_news_impact"];
const API_METRICS: PerfMetric[] = [
  "ai_chart_analysis",
  "ai_news_impact",
  "news_fetch",
];

export async function loadPerfStats(): Promise<PerfStats> {
  const empty: PerfStats = {
    avgAiResponseMs: 0,
    aiCallCountMonth: 0,
    totalApiCallsMonth: 0,
    totalTokensMonth: 0,
    estCostUsdMonth: 0,
  };
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return empty;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Last 10 AI calls (any time) for average response
  const { data: last10 } = await supabase
    .from("performance_logs")
    .select("duration_ms")
    .eq("user_id", u.user.id)
    .in("metric", AI_METRICS)
    .order("created_at", { ascending: false })
    .limit(10);

  const avg = last10 && last10.length
    ? Math.round(last10.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / last10.length)
    : 0;

  // Month-to-date API call rows
  const { data: monthRows } = await supabase
    .from("performance_logs")
    .select("metric, tokens_used")
    .eq("user_id", u.user.id)
    .in("metric", API_METRICS)
    .gte("created_at", startOfMonth.toISOString())
    .limit(10_000);

  const rows = monthRows ?? [];
  const aiCalls = rows.filter((r) => AI_METRICS.includes(r.metric as PerfMetric)).length;
  const totalTokens = rows.reduce((s, r) => s + (r.tokens_used ?? 0), 0);

  return {
    avgAiResponseMs: avg,
    aiCallCountMonth: aiCalls,
    totalApiCallsMonth: rows.length,
    totalTokensMonth: totalTokens,
    estCostUsdMonth: estimateCostUsd(totalTokens),
  };
}