import type { Database } from "@/integrations/supabase/types";

export type ScalingTier = Database["public"]["Tables"]["scaling_tiers"]["Row"];
export type ScalingTierInsert = Database["public"]["Tables"]["scaling_tiers"]["Insert"];

export const DEFAULT_TIERS: Omit<ScalingTierInsert, "user_id">[] = [
  {
    tier_number: 1,
    name: "Challenge Mode",
    min_balance: 100,
    max_balance: 1000,
    instruments: ["MES", "MNQ", "MBT"],
    max_risk_pct: 15,
    max_trades_per_day: 2,
    target_rr: 1.5,
    focus: "Consistency over profits",
    extra_rules: [],
  },
  {
    tier_number: 2,
    name: "Growth Mode",
    min_balance: 1000,
    max_balance: 5000,
    instruments: ["MES", "MNQ"],
    max_risk_pct: 10,
    max_trades_per_day: 2,
    target_rr: 2.0,
    focus: "Compound size carefully (2 contracts max)",
    extra_rules: ["Must have 60%+ last-20 win rate before adding second contract"],
  },
  {
    tier_number: 3,
    name: "Scale Mode",
    min_balance: 5000,
    max_balance: 25000,
    instruments: ["MES", "ES (consider transition at $10K)"],
    max_risk_pct: 8,
    max_trades_per_day: 3,
    target_rr: 2.0,
    focus: "Only A+ playbook setups",
    extra_rules: [
      "Risk 5–8% per trade depending on setup grade",
      "Playbook required: only A+ setups",
      "Weekly debrief mandatory before starting a new week",
    ],
  },
  {
    tier_number: 4,
    name: "Professional Mode",
    min_balance: 25000,
    max_balance: null,
    instruments: ["Prop firm funded account"],
    max_risk_pct: 3,
    max_trades_per_day: 3,
    target_rr: 2.0,
    focus: "Preservation + payout consistency",
    extra_rules: [
      "Risk 2–3% per trade",
      "Strict daily-loss hard stops",
      "VIX adjustment always active",
      "Regime filter mandatory daily",
    ],
  },
];

/** Return the tier whose [min, max) range contains `balance`. */
export function detectTier(
  tiers: Pick<ScalingTier, "tier_number" | "min_balance" | "max_balance">[],
  balance: number,
): number | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.tier_number - b.tier_number);
  let active = sorted[0].tier_number;
  for (const t of sorted) {
    const min = Number(t.min_balance);
    const max = t.max_balance == null ? Infinity : Number(t.max_balance);
    if (balance >= min && balance < max) return t.tier_number;
    if (balance >= min) active = t.tier_number;
  }
  return active;
}

export function nextTier(
  tiers: Pick<ScalingTier, "tier_number" | "min_balance">[],
  currentTier: number,
): { tier_number: number; min_balance: number } | null {
  const sorted = [...tiers]
    .sort((a, b) => a.tier_number - b.tier_number)
    .map((t) => ({ tier_number: t.tier_number, min_balance: Number(t.min_balance) }));
  return sorted.find((t) => t.tier_number > currentTier) ?? null;
}