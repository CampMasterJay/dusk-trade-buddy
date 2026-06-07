import type { Trade } from "@/lib/tradeService";

export type MarketRegime =
  | "Trending Up"
  | "Trending Down"
  | "Ranging"
  | "High Volatility"
  | "News-Driven"
  | "Low Volatility";

export const MARKET_REGIMES: MarketRegime[] = [
  "Trending Up",
  "Trending Down",
  "Ranging",
  "High Volatility",
  "News-Driven",
  "Low Volatility",
];

export interface RegimeGuidance {
  label: MarketRegime;
  short: string;
  description: string;
  recommended: string[];
  avoid: string[];
  sizePct: number; // % of normal size
  sizeNote: string;
  color: string; // tailwind classes for accent
}

export const REGIME_GUIDANCE: Record<MarketRegime, RegimeGuidance> = {
  "Trending Up": {
    label: "Trending Up",
    short: "Strong directional move, higher highs",
    description:
      "Buy pullbacks. Trend continuation favored, fades dangerous.",
    recommended: ["ORB", "Flag", "VWAP Reclaim", "B&R"],
    avoid: ["Mean Reversion", "Counter-trend Fade", "Inside Bar Short"],
    sizePct: 100,
    sizeNote: "Full size — trend-following has edge here.",
    color: "border-trade-green/40 bg-trade-green/10 text-trade-green",
  },
  "Trending Down": {
    label: "Trending Down",
    short: "Strong directional move, lower lows",
    description:
      "Sell rallies. Counter-trend longs typically get run over.",
    recommended: ["ORB", "Flag", "Breakdown", "B&R"],
    avoid: ["Mean Reversion Long", "Bottom-fishing", "Reversal"],
    sizePct: 100,
    sizeNote: "Full size — trend-following has edge here.",
    color: "border-trade-red/40 bg-trade-red/10 text-trade-red",
  },
  Ranging: {
    label: "Ranging",
    short: "Price chopping between two levels",
    description:
      "Trade the edges, not the middle. Breakouts mostly fail.",
    recommended: ["VWAP Fade", "Range Bounce", "Mean Reversion"],
    avoid: ["ORB", "Breakout", "Trend Continuation"],
    sizePct: 75,
    sizeNote: "75% of normal — breakouts fail in ranges.",
    color: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  },
  "High Volatility": {
    label: "High Volatility",
    short: "VIX > 25, large candles, wide spreads",
    description:
      "Wider stops, smaller size. Slippage and whipsaw risk are high.",
    recommended: ["Trend Continuation", "VWAP Reclaim"],
    avoid: ["Tight Mean Reversion", "Scalps", "Inside Bar"],
    sizePct: 50,
    sizeNote: "50% of normal — wider stops eat risk budget.",
    color: "border-orange-500/40 bg-orange-500/10 text-orange-500",
  },
  "News-Driven": {
    label: "News-Driven",
    short: "Major catalyst controlling price",
    description:
      "Wait for the dust to settle. Technicals fail around catalysts.",
    recommended: ["Post-news Trend Continuation"],
    avoid: ["Pre-news Fades", "Technical Setups", "Mean Reversion"],
    sizePct: 50,
    sizeNote: "50% of normal — news can override any setup.",
    color: "border-purple-500/40 bg-purple-500/10 text-purple-400",
  },
  "Low Volatility": {
    label: "Low Volatility",
    short: "VIX < 14, tight ranges, slow movement",
    description:
      "Patience required. Many days simply aren't worth trading.",
    recommended: ["VWAP Fade", "Range Bounce", "Mean Reversion"],
    avoid: ["Breakouts", "Momentum Chasing"],
    sizePct: 75,
    sizeNote: "75% of normal — small ranges = small R.",
    color: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  },
};

/**
 * Historical win rate for the given regime across the user's trades.
 * Returns null when fewer than 3 prior trades exist in that regime.
 */
export function winRateForRegime(
  trades: Trade[],
  regime: MarketRegime,
): { wr: number | null; sample: number } {
  const sample = trades.filter(
    (t) =>
      (t as { market_regime?: string | null }).market_regime === regime &&
      (t.result === "Win" || t.result === "Loss"),
  );
  if (sample.length < 3) return { wr: null, sample: sample.length };
  const wins = sample.filter((t) => t.result === "Win").length;
  return { wr: wins / sample.length, sample: sample.length };
}