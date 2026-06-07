import type { Trade } from "@/lib/tradeService";

export type VixTierKey = "low" | "normal" | "elevated" | "high";

export type VixTier = {
  key: VixTierKey;
  label: string;
  range: string;
  min: number;
  max: number;
  color: string;
};

export function buildVixTiers(thresholds?: {
  low?: number | null;
  normal?: number | null;
  elevated?: number | null;
}): VixTier[] {
  const low = Number(thresholds?.low ?? 15);
  const normal = Number(thresholds?.normal ?? 20);
  const elevated = Number(thresholds?.elevated ?? 30);
  return [
    { key: "low", label: "Low Vol", range: `VIX < ${low}`, min: 0, max: low, color: "var(--trade-green)" },
    { key: "normal", label: "Normal", range: `${low}–${normal}`, min: low, max: normal, color: "hsl(200 80% 55%)" },
    { key: "elevated", label: "Elevated", range: `${normal}–${elevated}`, min: normal, max: elevated, color: "hsl(35 85% 55%)" },
    { key: "high", label: "High Vol", range: `> ${elevated}`, min: elevated, max: Infinity, color: "var(--trade-red)" },
  ];
}

export function classifyVix(vix: number | null | undefined, tiers: VixTier[]): VixTier | null {
  if (vix == null || !Number.isFinite(Number(vix))) return null;
  const v = Number(vix);
  return tiers.find((t) => v >= t.min && v < t.max) ?? null;
}

export type VixBucketStats = {
  tier: VixTier;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  netPnl: number;
};

export function bucketTradesByVix(
  trades: Trade[],
  tiers: VixTier[],
): VixBucketStats[] {
  return tiers.map((tier) => {
    const inTier = trades.filter((t) => {
      const v = (t as { vix_at_entry?: number | null }).vix_at_entry;
      if (v == null) return false;
      const n = Number(v);
      return n >= tier.min && n < tier.max;
    });
    const decisive = inTier.filter((t) => t.result === "Win" || t.result === "Loss");
    const wins = decisive.filter((t) => t.result === "Win").length;
    const losses = decisive.filter((t) => t.result === "Loss").length;
    const rs = inTier.map((t) => Number(t.r_multiple)).filter((n) => Number.isFinite(n));
    const avgR = rs.length > 0 ? rs.reduce((s, n) => s + n, 0) / rs.length : 0;
    const netPnl = inTier.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    return {
      tier,
      count: inTier.length,
      wins,
      losses,
      winRate: decisive.length > 0 ? wins / decisive.length : 0,
      avgR,
      netPnl,
    };
  });
}