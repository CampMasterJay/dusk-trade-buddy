/**
 * Volatility-adjusted position sizing.
 *
 *   Adjusted Risk % = Base Risk % × (Baseline VIX ÷ Current VIX)
 *
 * Capped at 1.25× the base (low-VIX ceiling) and floored at 0.40× (high-VIX floor).
 */

export const VIX_CAP_MULTIPLIER = 1.25;
export const VIX_FLOOR_MULTIPLIER = 0.4;

export type VixAdjustment = {
  /** Effective risk % to use for the next trade. */
  adjustedPct: number;
  /** Multiplier applied to the base risk %. */
  factor: number;
  /** True when capped or floored. */
  capped: boolean;
  /** When this returns null/undefined inputs were missing — caller should use baseRiskPct. */
  active: boolean;
  reason:
    | "disabled"
    | "missing-vix"
    | "normal"
    | "ceiling-cap"
    | "floor-cap"
    | "reduced"
    | "boosted";
};

export function adjustRiskPct(input: {
  baseRiskPct: number;
  currentVix: number | null | undefined;
  baselineVix: number | null | undefined;
  enabled: boolean;
}): VixAdjustment {
  const base = Number(input.baseRiskPct) || 0;
  if (!input.enabled) {
    return {
      adjustedPct: base,
      factor: 1,
      capped: false,
      active: false,
      reason: "disabled",
    };
  }
  const vix = Number(input.currentVix);
  const baseline = Number(input.baselineVix);
  if (
    !Number.isFinite(vix) ||
    vix <= 0 ||
    !Number.isFinite(baseline) ||
    baseline <= 0
  ) {
    return {
      adjustedPct: base,
      factor: 1,
      capped: false,
      active: false,
      reason: "missing-vix",
    };
  }

  const rawFactor = baseline / vix;
  const ceiling = VIX_CAP_MULTIPLIER;
  const floor = VIX_FLOOR_MULTIPLIER;
  let factor = rawFactor;
  let reason: VixAdjustment["reason"] =
    rawFactor === 1
      ? "normal"
      : rawFactor > 1
        ? "boosted"
        : "reduced";
  let capped = false;
  if (rawFactor > ceiling) {
    factor = ceiling;
    reason = "ceiling-cap";
    capped = true;
  } else if (rawFactor < floor) {
    factor = floor;
    reason = "floor-cap";
    capped = true;
  }

  return {
    adjustedPct: +(base * factor).toFixed(2),
    factor: +factor.toFixed(4),
    capped,
    active: true,
    reason,
  };
}