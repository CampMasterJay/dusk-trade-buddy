import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];
export type UserSettingsUpdate = Database["public"]["Tables"]["user_settings"]["Update"];

const DEFAULTS = {
  starting_balance: 100,
  current_balance: 100,
  risk_pct: 15,
  rr_ratio: 1.5,
  challenge_target: 1000,
};

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: insertError } = await supabase
    .from("user_settings")
    .insert({ user_id: userId, ...DEFAULTS })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}

export async function updateUserSettings(
  userId: string,
  updates: UserSettingsUpdate,
): Promise<UserSettings> {
  const { data, error } = await supabase
    .from("user_settings")
    .update(updates)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function calculateCurrentBalance(userId: string): Promise<number> {
  const settings = await getUserSettings(userId);

  const { data: trades, error } = await supabase
    .from("trades")
    .select("pnl")
    .eq("user_id", userId);

  if (error) throw error;

  const futuresPnl = (trades ?? []).reduce(
    (acc, t) => acc + (Number(t.pnl) || 0),
    0,
  );

  const { data: optTrades, error: optErr } = await supabase
    .from("options_trades" as any)
    .select("net_pnl")
    .eq("user_id", userId);

  if (optErr) throw optErr;

  const optionsPnl = (optTrades ?? []).reduce(
    (acc: number, t: any) => acc + (Number(t.net_pnl) || 0),
    0,
  );

  const currentBalance =
    Number(settings.starting_balance) + futuresPnl + optionsPnl;

  if (Number(settings.current_balance) !== currentBalance) {
    await updateUserSettings(userId, { current_balance: currentBalance });
  }

  return currentBalance;
}