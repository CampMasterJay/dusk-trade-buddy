import type { Trade } from "@/lib/tradeService";

export type PlaybookEntryLite = {
  id: string;
  name: string;
  status: "Active" | "Testing" | "Retired";
  win_rate: number | null;
  baseline_win_rate: number | null;
  trade_count: number;
  baseline_trade_count: number | null;
  filters: Record<string, unknown>;
};

export type Conditions = {
  setup: string | null;
  direction: "Long" | "Short" | null;
  instrument: string | null;
  hour: number | null;
  vix: number | null;
  sessionNum: number | null;
  dow: number | null; // 1..7 Sun=1
  regime: string | null;
  checklistScore: number | null;
  consecWins: number;
  consecLosses: number;
};

export type PlaybookScore =
  | "A+ Match"
  | "Partial Match"
  | "No Match"
  | "Avoid Pattern";

export type MatchResult = {
  score: PlaybookScore;
  entry: PlaybookEntryLite | null;
  winRate: number | null;
  tradeCount: number | null;
  matchedCount: number;
  totalChecks: number;
};

type F = {
  setups?: string[];
  regimes?: string[];
  instruments?: string[];
  dows?: number[];
  hourRange?: [number, number];
  vixRange?: [number, number];
  sessionNums?: number[];
  checklistRange?: [number, number];
  direction?: "Long" | "Short" | "Both";
  consecWinsMin?: number;
  consecLossesMin?: number;
};

/** Returns { satisfied, total } across the *specified* (non-default) filter conditions only. */
function evaluate(filters: F, c: Conditions): { satisfied: number; total: number } {
  let total = 0;
  let ok = 0;
  const test = (cond: boolean) => {
    total += 1;
    if (cond) ok += 1;
  };

  if (filters.setups && filters.setups.length)
    test(!!c.setup && filters.setups.includes(c.setup));
  if (filters.regimes && filters.regimes.length)
    test(!!c.regime && filters.regimes.includes(c.regime));
  if (filters.instruments && filters.instruments.length)
    test(!!c.instrument && filters.instruments.includes(c.instrument));
  if (filters.dows && filters.dows.length)
    test(c.dow != null && filters.dows.includes(c.dow));
  if (filters.hourRange && (filters.hourRange[0] > 0 || filters.hourRange[1] < 23)) {
    test(c.hour != null && c.hour >= filters.hourRange[0] && c.hour <= filters.hourRange[1]);
  }
  if (filters.vixRange && (filters.vixRange[0] > 10 || filters.vixRange[1] < 40)) {
    test(c.vix != null && c.vix >= filters.vixRange[0] && c.vix <= filters.vixRange[1]);
  }
  if (filters.sessionNums && filters.sessionNums.length) {
    const n = c.sessionNum ?? 0;
    const bucket = n === 1 ? 1 : n === 2 ? 2 : n >= 3 ? 3 : 0;
    test(bucket > 0 && filters.sessionNums.includes(bucket));
  }
  if (filters.checklistRange && (filters.checklistRange[0] > 0 || filters.checklistRange[1] < 10)) {
    test(
      c.checklistScore != null &&
        c.checklistScore >= filters.checklistRange[0] &&
        c.checklistScore <= filters.checklistRange[1],
    );
  }
  if (filters.direction && filters.direction !== "Both")
    test(c.direction === filters.direction);
  if (filters.consecWinsMin && filters.consecWinsMin > 0)
    test(c.consecWins >= filters.consecWinsMin);
  if (filters.consecLossesMin && filters.consecLossesMin > 0)
    test(c.consecLosses >= filters.consecLossesMin);

  return { satisfied: ok, total };
}

const A_PLUS_WR = 0.6;
const AVOID_WR = 0.4;
const PARTIAL_THRESHOLD = 0.7;

export function classifyConditions(
  entries: PlaybookEntryLite[],
  c: Conditions,
): MatchResult {
  // Consider Active + Testing entries for positive matches; Retired/low-WR -> Avoid
  let bestFull: { entry: PlaybookEntryLite; total: number } | null = null;
  let bestPartial: { entry: PlaybookEntryLite; ratio: number; matched: number; total: number } | null = null;
  let worstAvoid: { entry: PlaybookEntryLite; total: number } | null = null;

  for (const entry of entries) {
    const filters = (entry.filters ?? {}) as F;
    const { satisfied, total } = evaluate(filters, c);
    if (total === 0) continue; // no specific conditions to match against

    const wr = entry.win_rate ?? entry.baseline_win_rate ?? 0;
    const isFull = satisfied === total;
    const ratio = satisfied / total;

    if (entry.status !== "Retired" && wr >= A_PLUS_WR && isFull) {
      if (!bestFull || total > bestFull.total || wr > (bestFull.entry.win_rate ?? 0)) {
        bestFull = { entry, total };
      }
    }
    if ((entry.status === "Retired" || wr < AVOID_WR) && isFull) {
      if (!worstAvoid || total > worstAvoid.total) worstAvoid = { entry, total };
    }
    if (entry.status !== "Retired" && !isFull && ratio >= PARTIAL_THRESHOLD) {
      if (!bestPartial || ratio > bestPartial.ratio) {
        bestPartial = { entry, ratio, matched: satisfied, total };
      }
    }
  }

  if (bestFull) {
    return {
      score: "A+ Match",
      entry: bestFull.entry,
      winRate: bestFull.entry.win_rate,
      tradeCount: bestFull.entry.trade_count,
      matchedCount: bestFull.total,
      totalChecks: bestFull.total,
    };
  }
  if (worstAvoid) {
    return {
      score: "Avoid Pattern",
      entry: worstAvoid.entry,
      winRate: worstAvoid.entry.win_rate,
      tradeCount: worstAvoid.entry.trade_count,
      matchedCount: worstAvoid.total,
      totalChecks: worstAvoid.total,
    };
  }
  if (bestPartial) {
    return {
      score: "Partial Match",
      entry: bestPartial.entry,
      winRate: bestPartial.entry.win_rate,
      tradeCount: bestPartial.entry.trade_count,
      matchedCount: bestPartial.matched,
      totalChecks: bestPartial.total,
    };
  }
  return {
    score: "No Match",
    entry: null,
    winRate: null,
    tradeCount: null,
    matchedCount: 0,
    totalChecks: 0,
  };
}

/** Derive Conditions from a logged Trade row. */
export function conditionsFromTrade(t: Trade): Conditions {
  return {
    setup: t.setup_tag ?? null,
    direction: (t.direction as "Long" | "Short") ?? null,
    instrument: t.instrument,
    hour: t.hour_of_day ?? null,
    vix: t.vix_at_entry != null ? Number(t.vix_at_entry) : null,
    sessionNum: t.session_trade_number ?? null,
    dow: t.day_of_week ?? null,
    regime: t.market_regime ?? null,
    checklistScore: t.checklist_score ?? null,
    consecWins: t.consecutive_wins_before ?? 0,
    consecLosses: t.consecutive_losses_before ?? 0,
  };
}