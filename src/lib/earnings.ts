import { supabase } from "@/integrations/supabase/client";

export type EarningsEvent = {
  id: string;
  user_id: string;
  ticker: string;
  earnings_date: string;
  notes: string | null;
};

export function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Returns the next upcoming earnings event for a ticker (within `withinDays`), or null. */
export function findUpcomingEarnings(
  events: EarningsEvent[] | null | undefined,
  ticker: string,
  fromDate: string,
  withinDays = 5,
): EarningsEvent | null {
  if (!events?.length || !ticker) return null;
  const t = ticker.trim().toUpperCase();
  const from = new Date(fromDate + "T00:00:00").getTime();
  let best: { ev: EarningsEvent; days: number } | null = null;
  for (const ev of events) {
    if (ev.ticker.trim().toUpperCase() !== t) continue;
    const days = Math.round(
      (new Date(ev.earnings_date + "T00:00:00").getTime() - from) / 86_400_000,
    );
    if (days < 0 || days > withinDays) continue;
    if (!best || days < best.days) best = { ev, days };
  }
  return best?.ev ?? null;
}

export async function fetchEarningsEvents(userId: string): Promise<EarningsEvent[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("earnings_events")
    .select("id,user_id,ticker,earnings_date,notes")
    .eq("user_id", userId)
    .gte("earnings_date", new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
    .order("earnings_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EarningsEvent[];
}