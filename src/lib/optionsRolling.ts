import { supabase } from "@/integrations/supabase/client";

export type OptionsRollingStats = {
  sample: number;
  winRate: number; // 0..1
  netPnl: number;
  netTheta: number;
};

/**
 * Fetch a quick rolling-window summary for closed options trades.
 * Pulls the most recent `window` closed trades and returns aggregate stats.
 */
export async function fetchOptionsRolling(
  userId: string,
  window = 20,
): Promise<OptionsRollingStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("options_trades")
    .select("net_pnl, status, entry_theta, leg1_contracts")
    .eq("user_id", userId)
    .eq("status", "Closed")
    .is("deleted_at", null)
    .order("trade_date", { ascending: false })
    .limit(window);

  const rows = (data ?? []) as {
    net_pnl: number | null;
    entry_theta: number | null;
    leg1_contracts: number | null;
  }[];

  if (rows.length === 0) {
    return { sample: 0, winRate: 0, netPnl: 0, netTheta: 0 };
  }

  const wins = rows.filter((r) => Number(r.net_pnl ?? 0) > 0).length;
  const netPnl = rows.reduce((a, r) => a + Number(r.net_pnl ?? 0), 0);
  const netTheta = rows.reduce(
    (a, r) =>
      a + Number(r.entry_theta ?? 0) * Math.max(1, Number(r.leg1_contracts ?? 1)),
    0,
  );

  return {
    sample: rows.length,
    winRate: wins / rows.length,
    netPnl,
    netTheta,
  };
}

export type OptionsDashboardSummary = {
  openPositions: number;
  todayRealizedPnl: number;
  todayUnrealizedEstimate: number; // sum of (current - entry) — best effort using stored fields
  netThetaPerDay: number;
  nextExpiration: { underlying: string; expiration: string; dte: number } | null;
};

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export async function fetchOptionsDashboardSummary(
  userId: string,
): Promise<OptionsDashboardSummary> {
  const today = new Date().toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openP = (supabase as any)
    .from("options_trades")
    .select(
      "id, underlying, leg1_expiration, leg1_contracts, entry_theta, premium_paid_or_received",
    )
    .eq("user_id", userId)
    .eq("status", "Open")
    .is("deleted_at", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const closedTodayP = (supabase as any)
    .from("options_trades")
    .select("net_pnl")
    .eq("user_id", userId)
    .eq("status", "Closed")
    .gte("updated_at", `${today}T00:00:00`)
    .is("deleted_at", null);

  const [openRes, closedTodayRes] = await Promise.all([openP, closedTodayP]);
  const open = (openRes.data ?? []) as {
    underlying: string;
    leg1_expiration: string;
    leg1_contracts: number | null;
    entry_theta: number | null;
    premium_paid_or_received: number | null;
  }[];
  const closedToday = (closedTodayRes.data ?? []) as { net_pnl: number | null }[];

  const netThetaPerDay = open.reduce(
    (a, r) =>
      a + Number(r.entry_theta ?? 0) * Math.max(1, Number(r.leg1_contracts ?? 1)),
    0,
  );

  const todayRealizedPnl = closedToday.reduce(
    (a, r) => a + Number(r.net_pnl ?? 0),
    0,
  );

  // Rough unrealized estimate: assume one day of theta has elapsed since entry.
  // Real-time mark requires broker quote — left to integration.
  const todayUnrealizedEstimate = netThetaPerDay; // dollars per day already

  let nextExpiration: OptionsDashboardSummary["nextExpiration"] = null;
  const now = new Date();
  for (const r of open) {
    if (!r.leg1_expiration) continue;
    const exp = new Date(r.leg1_expiration + "T16:00:00");
    const dte = Math.max(0, daysBetween(now, exp));
    if (!nextExpiration || dte < nextExpiration.dte) {
      nextExpiration = { underlying: r.underlying, expiration: r.leg1_expiration, dte };
    }
  }

  return {
    openPositions: open.length,
    todayRealizedPnl,
    todayUnrealizedEstimate,
    netThetaPerDay,
    nextExpiration,
  };
}