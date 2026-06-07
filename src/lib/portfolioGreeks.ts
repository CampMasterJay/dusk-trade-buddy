import { supabase } from "@/integrations/supabase/client";

export type OpenOptionsRow = {
  id: string;
  underlying: string;
  strategy_type: string;
  direction_bias: string | null;
  leg1_contracts: number;
  entry_delta: number | null;
  entry_gamma: number | null;
  entry_theta: number | null;
  entry_vega: number | null;
};

export type PortfolioGreeks = {
  positions: number;
  netDelta: number;
  netGamma: number;
  netTheta: number; // $/day (already a per-position dollar figure)
  netVega: number; // $ per 1% IV move
  bias: "Bullish" | "Bearish" | "Neutral";
  warnings: string[];
};

export async function fetchOpenOptionsGreeks(userId: string): Promise<PortfolioGreeks> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("options_trades")
    .select(
      "id, underlying, strategy_type, direction_bias, leg1_contracts, entry_delta, entry_gamma, entry_theta, entry_vega",
    )
    .eq("user_id", userId)
    .eq("status", "Open")
    .is("deleted_at", null);

  if (error) throw error;
  return summarizeGreeks((data ?? []) as OpenOptionsRow[]);
}

export function summarizeGreeks(rows: OpenOptionsRow[]): PortfolioGreeks {
  let netDelta = 0;
  let netGamma = 0;
  let netTheta = 0;
  let netVega = 0;

  for (const r of rows) {
    const c = Math.max(1, Number(r.leg1_contracts) || 1);
    netDelta += (Number(r.entry_delta) || 0) * c;
    netGamma += (Number(r.entry_gamma) || 0) * c;
    netTheta += (Number(r.entry_theta) || 0) * c;
    netVega += (Number(r.entry_vega) || 0) * c;
  }

  const bias: PortfolioGreeks["bias"] =
    netDelta > 0.15 ? "Bullish" : netDelta < -0.15 ? "Bearish" : "Neutral";

  const warnings: string[] = [];
  if (netTheta < -50) {
    warnings.push(
      `HIGH THETA DECAY: Your options positions are losing ${formatMoney(Math.abs(netTheta))}/day to time decay.`,
    );
  }
  if (netDelta > 0.8) {
    warnings.push(
      `HIGH DIRECTIONAL EXPOSURE: Your portfolio is heavily bullish (net delta ${netDelta.toFixed(2)}).`,
    );
  } else if (netDelta < -0.8) {
    warnings.push(
      `HIGH DIRECTIONAL EXPOSURE: Your portfolio is heavily bearish (net delta ${netDelta.toFixed(2)}).`,
    );
  }

  return {
    positions: rows.length,
    netDelta,
    netGamma,
    netTheta,
    netVega,
    bias,
    warnings,
  };
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}