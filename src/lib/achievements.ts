import { supabase } from "@/integrations/supabase/client";
import { triggerHaptic } from "@/hooks/useHaptic";
import { toast } from "sonner";
import {
  Trophy,
  Award,
  Flame,
  TrendingUp,
  Target,
  Crown,
  Shield,
  Newspaper,
  Sparkles,
  Medal,
  type LucideIcon,
} from "lucide-react";

export type AchievementKey =
  | "first_trade"
  | "first_win"
  | "win_streak_5"
  | "positive_ev"
  | "balance_2x"
  | "balance_5x"
  | "challenge_complete"
  | "disciplined_10"
  | "news_trader"
  | "setup_master";

export type Achievement = {
  key: AchievementKey;
  title: string;
  description: string;
  icon: LucideIcon;
  hint: string;
};

export const ACHIEVEMENTS: Achievement[] = [
  { key: "first_trade",        title: "First Trade",         description: "Log your very first trade.",                       icon: Sparkles,   hint: "Log a trade to unlock." },
  { key: "first_win",          title: "First Win",           description: "Close your first winning trade.",                   icon: Award,      hint: "Take a winning trade." },
  { key: "win_streak_5",       title: "5 Win Streak",        description: "Win 5 trades in a row.",                            icon: Flame,      hint: "Win 5 trades back-to-back." },
  { key: "positive_ev",        title: "Positive EV",         description: "Achieve positive expected value after 20+ trades.", icon: TrendingUp, hint: "Reach 20 trades with positive EV." },
  { key: "balance_2x",         title: "2× Balance",          description: "Double your starting balance.",                     icon: Target,     hint: "Double your starting balance." },
  { key: "balance_5x",         title: "5× Balance",          description: "Grow your balance to 5× starting.",                 icon: Trophy,     hint: "Reach 5× starting balance." },
  { key: "challenge_complete", title: "Challenge Complete",  description: "Hit your challenge target.",                        icon: Crown,      hint: "Reach your challenge target balance." },
  { key: "disciplined_10",     title: "Iron Discipline",     description: "10 trading days following your game plan.",          icon: Shield,     hint: "Stick to 10 game plans." },
  { key: "news_trader",        title: "News Trader",         description: "Tag 10 trades with a news event.",                   icon: Newspaper,  hint: "Link 10 trades to news." },
  { key: "setup_master",       title: "Setup Master",        description: "Log 50 chart analyses with quality ≥ 7.",           icon: Medal,      hint: "Save 50 high-quality analyses." },
];

export type StreakSnapshot = {
  currentWinStreak: number;
  longestWinStreak: number;
  daysTradedStreak: number;
  disciplineStreak: number;
};

export const EMPTY_STREAKS: StreakSnapshot = {
  currentWinStreak: 0,
  longestWinStreak: 0,
  daysTradedStreak: 0,
  disciplineStreak: 0,
};

type TradeRow = {
  id: string;
  date: string;
  result: string;
  news_id: string | null;
  created_at: string;
};

function daysAgoUTC(dateStr: string): number {
  // Compute whole-day distance from today (UTC) for a YYYY-MM-DD date.
  const today = new Date();
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = dateStr.split("-").map(Number);
  const d0 = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  return Math.round((t - d0) / 86_400_000);
}

function computeConsecutiveFromToday(dates: string[]): number {
  // dates: sorted distinct YYYY-MM-DD ascending or descending — we'll normalize.
  const set = new Set(dates);
  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (set.has(key)) streak++;
    else if (i === 0) continue; // allow today to be missing
    else break;
  }
  return streak;
}

export function computeStreaks(
  trades: TradeRow[],
  disciplinePlanDates: string[],
): StreakSnapshot {
  // Win streaks — iterate trades chronologically.
  const chrono = [...trades].sort((a, b) =>
    a.date === b.date
      ? a.created_at.localeCompare(b.created_at)
      : a.date.localeCompare(b.date),
  );
  let current = 0;
  let longest = 0;
  for (const t of chrono) {
    if (t.result === "Win") {
      current++;
      longest = Math.max(longest, current);
    } else if (t.result === "Loss") {
      current = 0;
    }
    // Breakeven / other → leave streak unchanged
  }

  const tradeDays = Array.from(new Set(trades.map((t) => t.date)));
  return {
    currentWinStreak: current,
    longestWinStreak: longest,
    daysTradedStreak: computeConsecutiveFromToday(tradeDays),
    disciplineStreak: computeConsecutiveFromToday(disciplinePlanDates),
  };
}

type UnlockContext = {
  trades: TradeRow[];
  streaks: StreakSnapshot;
  totalPnl: number;
  startingBalance: number;
  currentBalance: number;
  challengeTarget: number;
  highQualityAnalyses: number;
  followedPlans: number;
};

function computeUnlocked(ctx: UnlockContext): Set<AchievementKey> {
  const out = new Set<AchievementKey>();
  const { trades, streaks, totalPnl, startingBalance, currentBalance, challengeTarget } = ctx;

  if (trades.length >= 1) out.add("first_trade");
  if (trades.some((t) => t.result === "Win")) out.add("first_win");
  if (streaks.longestWinStreak >= 5) out.add("win_streak_5");

  if (trades.length >= 20) {
    const ev = totalPnl / trades.length;
    if (ev > 0) out.add("positive_ev");
  }

  if (startingBalance > 0) {
    if (currentBalance >= startingBalance * 2) out.add("balance_2x");
    if (currentBalance >= startingBalance * 5) out.add("balance_5x");
  }
  if (challengeTarget > 0 && currentBalance >= challengeTarget) {
    out.add("challenge_complete");
  }

  if (ctx.followedPlans >= 10) out.add("disciplined_10");

  const newsTagged = trades.filter((t) => t.news_id && t.news_id.trim().length > 0).length;
  if (newsTagged >= 10) out.add("news_trader");

  if (ctx.highQualityAnalyses >= 50) out.add("setup_master");

  return out;
}

export type AchievementStatus = {
  achievement: Achievement;
  unlocked: boolean;
  unlockedAt: string | null;
};

export type AchievementsSnapshot = {
  statuses: AchievementStatus[];
  streaks: StreakSnapshot;
  unlockedCount: number;
  totalCount: number;
};

/**
 * Loads everything needed for the gallery + streaks display,
 * and unlocks any new achievements (firing toast + vibration).
 */
export async function refreshAchievements(): Promise<AchievementsSnapshot> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    return {
      statuses: ACHIEVEMENTS.map((a) => ({ achievement: a, unlocked: false, unlockedAt: null })),
      streaks: EMPTY_STREAKS,
      unlockedCount: 0,
      totalCount: ACHIEVEMENTS.length,
    };
  }

  const [tradesRes, plansRes, analysesRes, settingsRes, existingRes] = await Promise.all([
    supabase
      .from("trades")
      .select("id,date,result,news_id,created_at,pnl")
      .is("deleted_at", null)
      .order("date", { ascending: true }),
    supabase
      .from("daily_game_plans")
      .select("plan_date,traded_planned_setups,stayed_within_loss,stuck_to_max_trades")
      .order("plan_date", { ascending: false }),
    supabase
      .from("chart_analyses")
      .select("setup_quality"),
    supabase
      .from("user_settings")
      .select("starting_balance,current_balance,challenge_target")
      .maybeSingle(),
    supabase
      .from("user_achievements")
      .select("achievement_key,unlocked_at"),
  ]);

  const trades = (tradesRes.data ?? []) as Array<TradeRow & { pnl: number | null }>;
  const totalPnl = trades.reduce((s, t) => s + Number(t.pnl ?? 0), 0);

  const plans = plansRes.data ?? [];
  const followedPlans = plans.filter(
    (p) => p.traded_planned_setups && p.stayed_within_loss && p.stuck_to_max_trades,
  );
  const disciplinePlanDates = followedPlans.map((p) => p.plan_date as string);

  const highQualityAnalyses = (analysesRes.data ?? []).filter(
    (a) => (a.setup_quality ?? 0) >= 7,
  ).length;

  const settings = settingsRes.data;
  const startingBalance = Number(settings?.starting_balance ?? 0);
  const currentBalance = Number(settings?.current_balance ?? 0);
  const challengeTarget = Number(settings?.challenge_target ?? 0);

  const streaks = computeStreaks(trades, disciplinePlanDates);
  const unlocked = computeUnlocked({
    trades,
    streaks,
    totalPnl,
    startingBalance,
    currentBalance,
    challengeTarget,
    highQualityAnalyses,
    followedPlans: followedPlans.length,
  });

  const existing = new Map<string, string>(
    (existingRes.data ?? []).map((r) => [r.achievement_key, r.unlocked_at]),
  );
  const newlyUnlocked = ACHIEVEMENTS.filter(
    (a) => unlocked.has(a.key) && !existing.has(a.key),
  );

  if (newlyUnlocked.length > 0) {
    const rows = newlyUnlocked.map((a) => ({ user_id: uid, achievement_key: a.key }));
    const { error } = await supabase
      .from("user_achievements")
      .upsert(rows, { onConflict: "user_id,achievement_key", ignoreDuplicates: true });
    if (!error) {
      for (const a of newlyUnlocked) {
        existing.set(a.key, new Date().toISOString());
        triggerHaptic("milestone");
        toast.success(`🏆 Achievement unlocked — ${a.title}`, {
          description: a.description,
          duration: 5000,
        });
      }
    }
  }

  const statuses: AchievementStatus[] = ACHIEVEMENTS.map((a) => ({
    achievement: a,
    unlocked: existing.has(a.key),
    unlockedAt: existing.get(a.key) ?? null,
  }));

  return {
    statuses,
    streaks,
    unlockedCount: statuses.filter((s) => s.unlocked).length,
    totalCount: ACHIEVEMENTS.length,
  };
}

/** Fire-and-forget from save sites (trade, plan, analysis). */
export function triggerAchievementCheck(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("edge:achievements-check"));
}