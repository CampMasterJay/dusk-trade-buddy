// Demo mode: lets visitors explore the app without auth.
// No trades or user data are read/written from the backend.
// Mode switching, analyzer, EdgeCoach, and walkthroughs still work
// because they're either client-only or hit public/anon-friendly endpoints.

import { useEffect, useState } from "react";

const KEY = "edgetrader.demoMode.v1";
const EVENT = "edgetrader:demoMode";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function enableDemoMode(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: true }));
}

export function exitDemoMode(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: false }));
}

export function useDemoMode(): boolean {
  const [demo, setDemo] = useState<boolean>(() => isDemoMode());
  useEffect(() => {
    setDemo(isDemoMode());
    const onCustom = (e: Event) => setDemo(Boolean((e as CustomEvent<boolean>).detail));
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setDemo(isDemoMode());
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return demo;
}

/** Mock user_settings row for demo sessions (no DB roundtrip). */
export function getDemoSettings() {
  const nowIso = new Date().toISOString();
  return {
    id: "demo-settings",
    user_id: "demo-user",
    starting_balance: 100,
    current_balance: 100,
    challenge_target: 1000,
    options_starting_balance: 100,
    options_current_balance: 100,
    options_challenge_target: 1000,
    risk_pct: 15,
    rr_ratio: 1.5,
    timeframe_days: 30,
    instrument: "MES",
    onboarding_completed: true,
    baseline_vix: 18,
    vix_adjustment_enabled: true,
    vix_tier_low_max: 15,
    vix_tier_normal_max: 20,
    vix_tier_elevated_max: 30,
    created_at: nowIso,
    updated_at: nowIso,
    // Permissive fallback for fields not enumerated above; consumers
    // generally coalesce with defaults.
  } as unknown as import("@/lib/userSettingsService").UserSettings;
}