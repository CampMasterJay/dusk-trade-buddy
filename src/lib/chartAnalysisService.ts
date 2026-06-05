import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ChartAnalysis = Database["public"]["Tables"]["chart_analyses"]["Row"];
export type ChartAnalysisInsert =
  Database["public"]["Tables"]["chart_analyses"]["Insert"];

export type ServiceResult<T> = { data: T | null; error: Error | null };

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : "Unknown error");
}

export async function listChartAnalyses(
  userId: string,
): Promise<ServiceResult<ChartAnalysis[]>> {
  try {
    const { data, error } = await supabase
      .from("chart_analyses")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

export async function saveChartAnalysis(
  payload: ChartAnalysisInsert,
): Promise<ServiceResult<ChartAnalysis>> {
  try {
    const { data, error } = await supabase
      .from("chart_analyses")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

export async function deleteChartAnalysis(
  id: string,
): Promise<ServiceResult<true>> {
  try {
    const { error } = await supabase
      .from("chart_analyses")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

export async function linkAnalysisToTrade(
  id: string,
  tradeId: string | null,
): Promise<ServiceResult<ChartAnalysis>> {
  try {
    const { data, error } = await supabase
      .from("chart_analyses")
      .update({ linked_trade_id: tradeId })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

/** Map the AI analysis JSON returned by analyzeChart into a row insert. */
export function buildAnalysisInsert(args: {
  userId: string;
  chartUrl: string | null;
  analysis: Record<string, unknown> | null;
}): ChartAnalysisInsert {
  const a = (args.analysis ?? {}) as {
    instrument?: string | null;
    timeframe?: string | null;
    trend?: string;
    patterns?: string[];
    bias?: string;
    summary?: string;
    setupIdea?: {
      direction?: string;
      entry?: string | number;
      stop?: string | number;
      target?: string | number;
      rr?: string | number;
    };
  };

  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const dir = a.setupIdea?.direction?.toLowerCase();
  const bias =
    dir === "long" ? "Long" : dir === "short" ? "Short" : "Neutral";

  return {
    user_id: args.userId,
    chart_url: args.chartUrl,
    instrument: a.instrument ?? null,
    timeframe: a.timeframe ?? null,
    trend: a.trend ?? null,
    setup_detected: a.patterns?.[0] ?? "None detected",
    suggested_entry: toNum(a.setupIdea?.entry),
    suggested_stop: toNum(a.setupIdea?.stop),
    suggested_target: toNum(a.setupIdea?.target),
    rr_ratio: toNum(a.setupIdea?.rr),
    bias_direction: bias,
    summary: a.summary ?? null,
    raw_analysis: (args.analysis ?? null) as never,
  };
}