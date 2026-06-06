import { supabase } from "@/integrations/supabase/client";
import { getLocalPrefs, setLocalPrefs } from "@/lib/localPrefs";

export type ChallengeOutcome = "Won" | "Lost" | "Reset";

export type ChallengeRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  starting_balance: number;
  target_balance: number;
  final_balance: number;
  total_trades: number;
  win_rate: number;
  outcome: ChallengeOutcome;
  created_at: string;
};

function determineOutcome(
  finalBalance: number,
  startingBalance: number,
  targetBalance: number,
  explicitReset: boolean,
): ChallengeOutcome {
  if (explicitReset) return "Reset";
  if (targetBalance > 0 && finalBalance >= targetBalance) return "Won";
  if (finalBalance < startingBalance) return "Lost";
  return "Reset";
}

/**
 * Snapshots the current challenge into the `challenges` table, then
 * deletes the user's trades and resets `current_balance` to starting.
 * Pass `explicitReset: true` for the manual reset path; otherwise the
 * outcome is auto-determined from final vs starting/target balance.
 */
export async function archiveAndResetChallenge(opts: {
  explicitReset: boolean;
}): Promise<{ archived: ChallengeRow | null; error: Error | null }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error("Not signed in");

    const [{ data: settings }, { data: trades }] = await Promise.all([
      supabase
        .from("user_settings")
        .select("starting_balance,current_balance,challenge_target,created_at")
        .maybeSingle(),
      supabase
        .from("trades")
        .select("id,result,date,created_at")
        .is("deleted_at", null),
    ]);

    const startingBalance = Number(settings?.starting_balance ?? 0);
    const currentBalance = Number(settings?.current_balance ?? startingBalance);
    const targetBalance = Number(settings?.challenge_target ?? 0);
    const totalTrades = trades?.length ?? 0;
    const wins = (trades ?? []).filter((t) => t.result === "Win").length;
    const decided = (trades ?? []).filter(
      (t) => t.result === "Win" || t.result === "Loss",
    ).length;
    const winRate = decided > 0 ? (wins / decided) * 100 : 0;

    const outcome = determineOutcome(
      currentBalance,
      startingBalance,
      targetBalance,
      opts.explicitReset,
    );

    const startedAtPref = getLocalPrefs().challengeStartedAt;
    const startedAt =
      startedAtPref ??
      (settings?.created_at as string | null) ??
      new Date().toISOString();

    let archived: ChallengeRow | null = null;
    // Only archive if there's anything worth recording.
    if (totalTrades > 0 || currentBalance !== startingBalance) {
      const { data: inserted, error: insertError } = await supabase
        .from("challenges")
        .insert({
          user_id: uid,
          started_at: startedAt,
          ended_at: new Date().toISOString(),
          starting_balance: startingBalance,
          target_balance: targetBalance,
          final_balance: currentBalance,
          total_trades: totalTrades,
          win_rate: Math.round(winRate * 10) / 10,
          outcome,
        })
        .select("*")
        .single();
      if (insertError) throw insertError;
      archived = inserted as ChallengeRow;
    }

    // Clear trades and reset balance for the new challenge.
    const { error: delError } = await supabase
      .from("trades")
      .delete()
      .eq("user_id", uid);
    if (delError) throw delError;

    const { error: settingsError } = await supabase
      .from("user_settings")
      .update({ current_balance: startingBalance })
      .eq("user_id", uid);
    if (settingsError) throw settingsError;

    setLocalPrefs({ challengeStartedAt: new Date().toISOString() });
    return { archived, error: null };
  } catch (err) {
    return {
      archived: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export async function listChallenges(): Promise<ChallengeRow[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .order("ended_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as ChallengeRow[];
}

export function challengeProfitPct(c: ChallengeRow): number {
  if (!c.starting_balance) return 0;
  return ((c.final_balance - c.starting_balance) / c.starting_balance) * 100;
}