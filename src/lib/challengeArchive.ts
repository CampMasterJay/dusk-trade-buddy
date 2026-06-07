import { supabase } from "@/integrations/supabase/client";
import { getLocalPrefs, setLocalPrefs } from "@/lib/localPrefs";
import { getTradingMode } from "@/lib/tradingMode";

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
  starting_playbook?: string | null;
  ending_playbook?: string | null;
  edge_health_trend?: string | null;
  most_used_regime?: string | null;
  most_profitable_setup?: string | null;
  biggest_behavioral_issue?: string | null;
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

    const mode = getTradingMode();
    const startCol = mode === "options" ? "options_starting_balance" : "starting_balance";
    const currentCol = mode === "options" ? "options_current_balance" : "current_balance";
    const targetCol = mode === "options" ? "options_challenge_target" : "challenge_target";

    const [{ data: settings }, { data: trades }] = await Promise.all([
      supabase
        .from("user_settings")
        .select(
          "starting_balance,current_balance,challenge_target,options_starting_balance,options_current_balance,options_challenge_target,created_at",
        )
        .maybeSingle(),
      supabase
        .from("trades")
        .select("id,result,date,created_at")
        .is("deleted_at", null),
    ]);

    const s = settings as Record<string, unknown> | null;
    const startingBalance = Number((s?.[startCol] as number | string | null | undefined) ?? 0);
    const currentBalance = Number((s?.[currentCol] as number | string | null | undefined) ?? startingBalance);
    const targetBalance = Number((s?.[targetCol] as number | string | null | undefined) ?? 0);
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

    // Enriched archive fields
    const tradeList = ((trades ?? []) as unknown) as Array<{
      result: string | null;
      setup_tag: string | null;
      market_regime: string | null;
      pnl: number | null;
      r_multiple: number | null;
      was_revenge_trade: boolean | null;
      created_at: string;
    }>;

    const regimeCounts = new Map<string, number>();
    const setupPnl = new Map<string, number>();
    let revengeCount = 0;
    for (const t of tradeList) {
      if (t.market_regime) regimeCounts.set(t.market_regime, (regimeCounts.get(t.market_regime) ?? 0) + 1);
      if (t.setup_tag) setupPnl.set(t.setup_tag, (setupPnl.get(t.setup_tag) ?? 0) + Number(t.pnl ?? 0));
      if (t.was_revenge_trade) revengeCount += 1;
    }
    const mostUsedRegime = [...regimeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const mostProfitableSetup = [...setupPnl.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const decidedTrades = tradeList
      .filter((t) => t.result === "Win" || t.result === "Loss")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    let edgeTrend: string | null = null;
    if (decidedTrades.length >= 6) {
      const mid = Math.floor(decidedTrades.length / 2);
      const wr = (arr: typeof decidedTrades) =>
        arr.length ? arr.filter((t) => t.result === "Win").length / arr.length : 0;
      const first = wr(decidedTrades.slice(0, mid));
      const second = wr(decidedTrades.slice(mid));
      const delta = second - first;
      edgeTrend = delta > 0.05 ? "Improving" : delta < -0.05 ? "Degrading" : "Stable";
    }

    let biggestIssue: string | null = null;
    if (totalTrades >= 5) {
      const revengePct = revengeCount / totalTrades;
      if (revengePct >= 0.2) biggestIssue = "Revenge trading after losses";
      else if (edgeTrend === "Degrading") biggestIssue = "Edge softening across challenge";
      else if (currentBalance < startingBalance) biggestIssue = "Negative expectancy / risk control";
    }

    const { data: pbEntries } = await supabase
      .from("playbook_entries")
      .select("name,status,created_at,updated_at")
      .eq("status", "Active")
      .order("updated_at", { ascending: false });
    const startingPlaybook =
      (pbEntries ?? []).filter((p) => p.created_at <= startedAt).slice(-1)[0]?.name ?? null;
    const endingPlaybook = pbEntries?.[0]?.name ?? null;

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
          starting_playbook: startingPlaybook,
          ending_playbook: endingPlaybook,
          edge_health_trend: edgeTrend,
          most_used_regime: mostUsedRegime,
          most_profitable_setup: mostProfitableSetup,
          biggest_behavioral_issue: biggestIssue,
          mode,
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
      .update({ [currentCol]: startingBalance })
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

export async function listChallenges(mode?: "futures" | "options"): Promise<ChallengeRow[]> {
  const activeMode = mode ?? getTradingMode();
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("mode", activeMode)
    .order("ended_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as ChallengeRow[];
}

export function challengeProfitPct(c: ChallengeRow): number {
  if (!c.starting_balance) return 0;
  return ((c.final_balance - c.starting_balance) / c.starting_balance) * 100;
}