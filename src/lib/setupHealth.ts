import type { Trade } from "@/lib/tradeService";

export type SetupHealthStatus =
  | "HEALTHY"
  | "SOFTENING"
  | "DEGRADING"
  | "INSUFFICIENT";

export type SetupHealth = {
  setupTag: string;
  totalTrades: number;
  allTimeWinRate: number; // 0..1
  last10WinRate: number | null;
  last20WinRate: number | null;
  trend: "Improving" | "Stable" | "Degrading";
  status: SetupHealthStatus;
  degradationThreshold: number; // win-rate below which we call it degrading
};

function winRate(trades: Trade[]): number | null {
  const decisive = trades.filter((t) => t.result === "Win" || t.result === "Loss");
  if (decisive.length === 0) return null;
  return decisive.filter((t) => t.result === "Win").length / decisive.length;
}

/**
 * Compute health for a single setup tag.
 * Pass all trades; we filter internally.
 */
export function computeSetupHealth(allTrades: Trade[], setupTag: string): SetupHealth {
  const matching = allTrades
    .filter((t) => (t as { setup_tag?: string | null }).setup_tag === setupTag)
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return db - da;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const total = matching.length;
  const allTime = winRate(matching) ?? 0;
  const last10 = total >= 1 ? winRate(matching.slice(0, 10)) : null;
  const last20 = total >= 1 ? winRate(matching.slice(0, 20)) : null;

  // Status calculation
  let status: SetupHealthStatus = "INSUFFICIENT";
  let trend: SetupHealth["trend"] = "Stable";
  const degradationThreshold = allTime * 0.85;

  if (total >= 10 && last20 != null) {
    const drop = allTime - last20; // positive means recent worse
    const pctDrop = allTime > 0 ? drop / allTime : 0;
    if (pctDrop >= 0.2) status = "DEGRADING";
    else if (pctDrop >= 0.1) status = "SOFTENING";
    else status = "HEALTHY";

    if (last20 > allTime + 0.05) trend = "Improving";
    else if (last20 < degradationThreshold) trend = "Degrading";
    else trend = "Stable";
  }

  return {
    setupTag,
    totalTrades: total,
    allTimeWinRate: allTime,
    last10WinRate: last10,
    last20WinRate: last20,
    trend,
    status,
    degradationThreshold,
  };
}

export const STATUS_META: Record<
  SetupHealthStatus,
  { dot: string; label: string; bg: string; border: string; text: string }
> = {
  HEALTHY: {
    dot: "🟢",
    label: "Healthy",
    bg: "bg-trade-green/10",
    border: "border-trade-green/30",
    text: "text-trade-green",
  },
  SOFTENING: {
    dot: "🟡",
    label: "Softening",
    bg: "bg-trade-amber/10",
    border: "border-trade-amber/30",
    text: "text-trade-amber",
  },
  DEGRADING: {
    dot: "🔴",
    label: "Degrading",
    bg: "bg-trade-red/10",
    border: "border-trade-red/30",
    text: "text-trade-red",
  },
  INSUFFICIENT: {
    dot: "⚫",
    label: "No data",
    bg: "bg-muted/30",
    border: "border-border",
    text: "text-muted-foreground",
  },
};