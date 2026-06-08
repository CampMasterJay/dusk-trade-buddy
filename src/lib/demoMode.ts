// Demo mode: visitor access without signup. State is per-browser, mirrors
// the tradingMode pattern (localStorage + custom event + useSyncExternalStore).

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { UserSettings } from "@/lib/userSettingsService";

const KEY = "edgetrader.demo.v1";
const EVENT = "edgetrader:demoMode";

export const DEMO_USER_ID = "00000000-0000-0000-0000-0000000000d3";

export const DEMO_USER: User = {
  id: DEMO_USER_ID,
  app_metadata: { provider: "demo", providers: ["demo"] },
  user_metadata: { full_name: "Demo Trader", demo: true },
  aud: "demo",
  email: "demo@edgetrader.app",
  created_at: new Date(0).toISOString(),
} as unknown as User;

export const DEMO_SETTINGS: UserSettings = {
  id: "demo-settings",
  user_id: DEMO_USER_ID,
  starting_balance: 5000,
  current_balance: 5000,
  peak_balance: 5000,
  risk_pct: 1,
  rr_ratio: 2,
  challenge_target: 10000,
  options_starting_balance: 5000,
  options_current_balance: 5000,
  options_challenge_target: 10000,
  onboarding_completed: true,
  primary_instrument: "MES",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as unknown as UserSettings;

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function enterDemoMode(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, "1");
    sessionStorage.setItem("edgetrader:demoWalkthroughOffer", "1");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: true }));
}

export function exitDemoMode(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem("edgetrader:demoWalkthroughOffer");
  } catch {
    /* ignore */
  }
  // Clear in-memory demo data.
  demoTradesStore.length = 0;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: false }));
}

export function useDemoMode(): boolean {
  const [on, setOn] = useState<boolean>(false);
  useEffect(() => {
    setOn(isDemoMode());
    const onCustom = () => setOn(isDemoMode());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setOn(isDemoMode());
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return on;
}

/** In-memory demo trade store. Wiped on refresh or demo exit. */
export const demoTradesStore: Array<Record<string, unknown>> = [];

export function demoCreateTrade(trade: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  const row = {
    id: `demo-${crypto.randomUUID()}`,
    user_id: DEMO_USER_ID,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...trade,
  };
  demoTradesStore.unshift(row);
  return row;
}

export function demoUpdateTrade(id: string, updates: Record<string, unknown>): Record<string, unknown> | null {
  const idx = demoTradesStore.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  demoTradesStore[idx] = { ...demoTradesStore[idx], ...updates, updated_at: new Date().toISOString() };
  return demoTradesStore[idx];
}

export function demoDeleteTrade(id: string): Record<string, unknown> | null {
  const idx = demoTradesStore.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const [removed] = demoTradesStore.splice(idx, 1);
  return removed;
}