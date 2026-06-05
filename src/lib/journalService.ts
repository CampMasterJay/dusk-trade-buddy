import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TradeJournal = Database["public"]["Tables"]["trade_journals"]["Row"];
export type TradeJournalInsert = Database["public"]["Tables"]["trade_journals"]["Insert"];
export type TradeJournalUpdate = Database["public"]["Tables"]["trade_journals"]["Update"];

export type EmotionState =
  | "Calm"
  | "Confident"
  | "Anxious"
  | "Impatient"
  | "Revenge"
  | "FOMO";

export const EMOTIONS: EmotionState[] = [
  "Calm",
  "Confident",
  "Anxious",
  "Impatient",
  "Revenge",
  "FOMO",
];

export type ServiceResult<T> = { data: T | null; error: Error | null };

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "object" && err && "message" in err) {
    return new Error(String((err as { message: unknown }).message));
  }
  return new Error("Unknown error");
}

export async function getJournalByTradeId(
  tradeId: string,
): Promise<ServiceResult<TradeJournal>> {
  try {
    const { data, error } = await supabase
      .from("trade_journals")
      .select("*")
      .eq("trade_id", tradeId)
      .maybeSingle();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

export async function getJournalTradeIds(
  userId: string,
): Promise<ServiceResult<Set<string>>> {
  try {
    const { data, error } = await supabase
      .from("trade_journals")
      .select("trade_id")
      .eq("user_id", userId);
    if (error) throw error;
    return {
      data: new Set((data ?? []).map((r) => r.trade_id as string)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

export async function upsertJournal(
  payload: TradeJournalInsert,
): Promise<ServiceResult<TradeJournal>> {
  try {
    const { data, error } = await supabase
      .from("trade_journals")
      .upsert(payload, { onConflict: "trade_id" })
      .select("*")
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}