import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  cacheTrades,
  readCachedTrades,
  cacheStats,
  readCachedStats,
  queueTrade,
  getQueuedTrades,
  markSynced,
} from "@/lib/offlineCache";

export type Trade = Database["public"]["Tables"]["trades"]["Row"];
export type TradeInsert = Database["public"]["Tables"]["trades"]["Insert"];
export type TradeUpdate = Database["public"]["Tables"]["trades"]["Update"];

export type ServiceResult<T> = { data: T | null; error: Error | null };

export type TradeStats = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  ev: number;
  totalR: number;
  largestWin: number;
  largestLoss: number;
};

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "object" && err && "message" in err) {
    return new Error(String((err as { message: unknown }).message));
  }
  return new Error("Unknown error");
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// Materialize queued (offline) trades into Trade rows for display.
// Marked with a `pending` flag via the id prefix ("pending-...").
function queuedToTrades(userId: string, queue: Awaited<ReturnType<typeof getQueuedTrades>>): Trade[] {
  const nowIso = new Date().toISOString();
  return queue.map((q) => {
    const t = q.trade;
    return {
      id: q.id,
      user_id: userId,
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
      date: t.date,
      instrument: t.instrument,
      direction: t.direction,
      entry: Number(t.entry),
      stop: Number(t.stop),
      target: Number(t.target),
      result: t.result,
      r_multiple: t.r_multiple ?? null,
      pnl: t.pnl ?? null,
      range_size: t.range_size ?? null,
      notes: t.notes ?? null,
      chart_url: t.chart_url ?? null,
      checklist_score: t.checklist_score ?? null,
      checklist_verdict: t.checklist_verdict ?? null,
      news_id: t.news_id ?? null,
      setup_tag: t.setup_tag ?? null,
    } as Trade;
  });
}

export async function getTrades(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<ServiceResult<Trade[]>> {
  try {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    const rows = data ?? [];
    // Only cache the first page — enough for offline browsing.
    if (offset === 0) await cacheTrades<Trade[]>(userId, rows);
    return { data: rows, error: null };
  } catch (err) {
    // Offline fallback: serve cached page + any queued (pending) trades.
    const cached = await readCachedTrades<Trade[]>(userId);
    if (cached) {
      const queue = await getQueuedTrades(userId);
      const pending = queuedToTrades(userId, queue);
      const merged = [...pending, ...cached].slice(offset, offset + limit);
      return { data: merged, error: null };
    }
    return { data: null, error: toError(err) };
  }
}

export async function getAllTrades(userId: string): Promise<ServiceResult<Trade[]>> {
  try {
    const all: Trade[] = [];
    const chunk = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(offset, offset + chunk - 1);
      if (error) throw error;
      const rows = data ?? [];
      all.push(...rows);
      if (rows.length < chunk) break;
      offset += chunk;
    }
    await cacheTrades<Trade[]>(userId, all);
    return { data: all, error: null };
  } catch (err) {
    const cached = await readCachedTrades<Trade[]>(userId);
    if (cached) {
      const queue = await getQueuedTrades(userId);
      return { data: [...cached, ...queuedToTrades(userId, queue)], error: null };
    }
    return { data: null, error: toError(err) };
  }
}

export async function getTradeById(
  id: string,
): Promise<ServiceResult<Trade>> {
  try {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

// Raw remote-only insert (used by the offline queue flusher).
export async function createTradeRemote(
  trade: TradeInsert,
): Promise<ServiceResult<Trade>> {
  try {
    const { data, error } = await supabase
      .from("trades")
      .insert(trade)
      .select("*")
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

export async function createTrade(
  trade: TradeInsert,
): Promise<ServiceResult<Trade>> {
  // Offline path — queue the trade and return a synthetic row so the UI
  // can render it immediately. It will be flushed on reconnect.
  if (isOffline() && trade.user_id) {
    const entry = await queueTrade(trade.user_id, trade);
    const [pending] = queuedToTrades(trade.user_id, [entry]);
    return { data: pending, error: null };
  }
  try {
    const { data, error } = await supabase
      .from("trades")
      .insert(trade)
      .select("*")
      .single();

    if (error) throw error;
    await markSynced();
    return { data, error: null };
  } catch (err) {
    // Network failure mid-request — fall back to queue.
    if (trade.user_id) {
      const entry = await queueTrade(trade.user_id, trade);
      const [pending] = queuedToTrades(trade.user_id, [entry]);
      return { data: pending, error: null };
    }
    return { data: null, error: toError(err) };
  }
}

export async function updateTrade(
  id: string,
  updates: TradeUpdate,
): Promise<ServiceResult<Trade>> {
  try {
    const { data, error } = await supabase
      .from("trades")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

export async function deleteTrade(
  id: string,
): Promise<ServiceResult<Trade>> {
  try {
    const { data, error } = await supabase
      .from("trades")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

export async function getTradeStats(
  userId: string,
): Promise<ServiceResult<TradeStats>> {
  try {
    const { data, error } = await supabase
      .from("trades")
      .select("result, pnl, r_multiple")
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) throw error;

    const trades = data ?? [];
    const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

    const winTrades = trades.filter((t) => t.result === "Win");
    const lossTrades = trades.filter((t) => t.result === "Loss");

    const wins = winTrades.length;
    const losses = lossTrades.length;
    const totalTrades = trades.length;
    const decided = wins + losses;
    const winRate = decided > 0 ? wins / decided : 0;

    const totalPnl = trades.reduce((a, t) => a + num(t.pnl), 0);
    const totalR = trades.reduce((a, t) => a + num(t.r_multiple), 0);

    const winsPnl = winTrades.map((t) => num(t.pnl));
    const lossesPnl = lossTrades.map((t) => num(t.pnl));

    const avgWin =
      winsPnl.length > 0
        ? winsPnl.reduce((a, b) => a + b, 0) / winsPnl.length
        : 0;
    const avgLoss =
      lossesPnl.length > 0
        ? lossesPnl.reduce((a, b) => a + b, 0) / lossesPnl.length
        : 0;

    // Expected value per trade based on observed win/loss frequencies and averages.
    const ev =
      decided > 0
        ? (wins / decided) * avgWin + (losses / decided) * avgLoss
        : 0;

    const allPnl = trades.map((t) => num(t.pnl));
    const largestWin = allPnl.length > 0 ? Math.max(0, ...allPnl) : 0;
    const largestLoss = allPnl.length > 0 ? Math.min(0, ...allPnl) : 0;

    const stats: TradeStats = {
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
    await cacheStats<TradeStats>(userId, stats);
    return { data: stats, error: null };
  } catch (err) {
    const cached = await readCachedStats<TradeStats>(userId);
    if (cached) return { data: cached, error: null };
    return { data: null, error: toError(err) };
  }
}