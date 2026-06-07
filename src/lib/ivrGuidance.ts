export type IvrBucket = "high" | "moderate" | "low";

export type IvrGuidance = {
  bucket: IvrBucket;
  headline: string;
  detail: string;
  preferred: string[];
  stance: "Seller" | "Either" | "Buyer";
};

export function ivrBucket(ivr: number | null | undefined): IvrBucket | null {
  if (ivr == null || !Number.isFinite(ivr)) return null;
  if (ivr > 60) return "high";
  if (ivr < 30) return "low";
  return "moderate";
}

export function ivrGuidance(ivr: number): IvrGuidance {
  const b = ivrBucket(ivr);
  if (b === "high") {
    return {
      bucket: "high",
      headline: "HIGH IV — Favor credit strategies",
      detail: "Premium is expensive. Be a seller.",
      preferred: ["Iron Condor", "Credit Spreads", "Covered Calls", "Cash Secured Puts"],
      stance: "Seller",
    };
  }
  if (b === "low") {
    return {
      bucket: "low",
      headline: "LOW IV — Favor debit strategies",
      detail: "Premium is cheap. Be a buyer.",
      preferred: ["Long Calls", "Long Puts", "Debit Spreads", "Long Straddle"],
      stance: "Buyer",
    };
  }
  return {
    bucket: "moderate",
    headline: "MODERATE IV — Either approach works",
    detail: "Debit spreads offer good R:R; credit spreads still viable.",
    preferred: ["Debit Spreads", "Credit Spreads"],
    stance: "Either",
  };
}

/** Sort strategies by edge given the bucket. Returns the score 0..1. */
export function strategyFitForIvr(strategyType: string, ivr: number): number {
  const isDebit = /\b(Long Call|Long Put|Bull Call|Bear Put|Long Straddle|Long Strangle|0DTE)\b/i.test(
    strategyType,
  );
  const isCredit = /\b(Iron Condor|Iron Butterfly|Bull Put|Bear Call|Covered Call|Cash Secured Put)\b/i.test(
    strategyType,
  );
  if (ivr > 60) return isCredit ? 1 : isDebit ? 0.2 : 0.5;
  if (ivr < 30) return isDebit ? 1 : isCredit ? 0.2 : 0.5;
  return 0.7;
}