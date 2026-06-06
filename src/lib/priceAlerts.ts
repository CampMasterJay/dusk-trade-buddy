import { supabase } from "@/integrations/supabase/client";
import { getLocalPrefs } from "@/lib/localPrefs";
import { notify } from "@/lib/notifications";
import { triggerHaptic } from "@/hooks/useHaptic";
import { toast } from "sonner";

export type PriceAlert = {
  id: string;
  user_id: string;
  instrument: string;
  price: number;
  direction: "above" | "below";
  active: boolean;
  triggered_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export const MAX_ACTIVE_ALERTS = 10;
const CHECK_INTERVAL_MS = 30_000;

export async function listAlerts(opts?: { active?: boolean }): Promise<PriceAlert[]> {
  let q = supabase.from("price_alerts").select("*").order("created_at", { ascending: false });
  if (opts?.active !== undefined) q = q.eq("active", opts.active);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PriceAlert[];
}

export async function createAlert(input: {
  instrument: string;
  price: number;
  direction: "above" | "below";
  note?: string;
}): Promise<PriceAlert> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");

  const active = await listAlerts({ active: true });
  if (active.length >= MAX_ACTIVE_ALERTS) {
    throw new Error(`Max ${MAX_ACTIVE_ALERTS} active alerts`);
  }

  const { data, error } = await supabase
    .from("price_alerts")
    .insert({
      user_id: userId,
      instrument: input.instrument.trim().toUpperCase(),
      price: input.price,
      direction: input.direction,
      note: input.note?.trim() || null,
      active: true,
    })
    .select()
    .single();
  if (error) throw error;
  notifyChanged();
  return data as PriceAlert;
}

export async function deleteAlert(id: string): Promise<void> {
  const { error } = await supabase.from("price_alerts").delete().eq("id", id);
  if (error) throw error;
  notifyChanged();
}

export async function deactivateAlert(id: string): Promise<void> {
  const { error } = await supabase
    .from("price_alerts")
    .update({ active: false, triggered_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  notifyChanged();
}

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("edge:price-alerts-changed"));
  }
}

/* -------- Price fetching (Alpaca REST) -------- */

const priceCache = new Map<string, { price: number; at: number }>();
const PRICE_TTL = 15_000;

export async function fetchPrice(symbol: string): Promise<number | null> {
  const sym = symbol.trim().toUpperCase();
  const cached = priceCache.get(sym);
  if (cached && Date.now() - cached.at < PRICE_TTL) return cached.price;

  const { alpacaKeyId, alpacaSecret } = getLocalPrefs();
  if (!alpacaKeyId || !alpacaSecret) return null;

  try {
    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(sym)}/trades/latest`,
      {
        headers: {
          "APCA-API-KEY-ID": alpacaKeyId,
          "APCA-API-SECRET-KEY": alpacaSecret,
        },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { trade?: { p?: number } };
    const price = json.trade?.p;
    if (typeof price !== "number") return null;
    priceCache.set(sym, { price, at: Date.now() });
    return price;
  } catch {
    return null;
  }
}

/* -------- Polling loop -------- */

let pollHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startPriceAlertPolling() {
  if (typeof window === "undefined" || pollHandle) return;
  void checkAlertsOnce();
  pollHandle = setInterval(() => {
    if (document.visibilityState === "visible") void checkAlertsOnce();
  }, CHECK_INTERVAL_MS);
}

export function stopPriceAlertPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

export async function checkAlertsOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const alerts = await listAlerts({ active: true });
    if (alerts.length === 0) return;

    const symbols = Array.from(new Set(alerts.map((a) => a.instrument)));
    const prices = new Map<string, number>();
    await Promise.all(
      symbols.map(async (s) => {
        const p = await fetchPrice(s);
        if (p !== null) prices.set(s, p);
      }),
    );

    for (const alert of alerts) {
      const price = prices.get(alert.instrument);
      if (price === undefined) continue;
      const hit =
        alert.direction === "above"
          ? price >= Number(alert.price)
          : price <= Number(alert.price);
      if (!hit) continue;

      await deactivateAlert(alert.id);
      const title = `🔔 ${alert.instrument} ${alert.direction === "above" ? "↑" : "↓"} ${alert.price}`;
      const body = `Price hit ${price.toFixed(2)} (${alert.direction} ${alert.price})`;
      void notify(title, { body, tag: `price-alert-${alert.id}` });
      try {
        triggerHaptic("milestone");
      } catch {
        /* ignore */
      }
      toast.success(title, { description: body });
    }
  } catch {
    /* swallow */
  } finally {
    running = false;
  }
}