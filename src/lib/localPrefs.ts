// Local-only preferences stored in localStorage (not synced).
// Used for fields that don't belong in the Supabase user_settings row:
// challenge end date, daily trade caps, custom tick values, Alpaca API keys,
// news refresh interval, market-open reminder time, display name.

import { useEffect, useState } from "react";

export type LocalPrefs = {
  challengeEndDate: string | null; // ISO yyyy-mm-dd
  challengeStartedAt: string | null; // ISO timestamp; set on new challenge
  maxTradesPerDay: number;
  dailyLossLimit: number | null; // null = auto-calc from risk
  dailyLossLimitOverride: boolean;
  customTickValues: Record<string, number>;
  marketOpenTime: string; // "HH:mm" CT
  alpacaKeyId: string;
  alpacaSecret: string;
  newsRefreshMinutes: number;
  displayName: string;
  hapticsEnabled: boolean;
  // Options-specific preferences
  optionsCommissionPerContract: number; // $ per contract per side
  optionsProfitTargetPct: number; // % of max profit (credit) or premium (debit)
  optionsStopLossPct: number; // % of premium / credit
  zeroDteHardExitEt: string; // "HH:mm" ET
  ivrSource: "broker" | "tos" | "manual" | "thinkorswim";
  earningsPlayMode: "warn" | "ask" | "ignore";
  tradeLogMarketFilter: "all" | "futures" | "options" | "stocks" | "crypto";
};

const KEY = "edgetrader.localPrefs.v1";

export const DEFAULT_PREFS: LocalPrefs = {
  challengeEndDate: null,
  challengeStartedAt: null,
  maxTradesPerDay: 2,
  dailyLossLimit: null,
  dailyLossLimitOverride: false,
  customTickValues: {},
  marketOpenTime: "08:25",
  alpacaKeyId: "",
  alpacaSecret: "",
  newsRefreshMinutes: 5,
  displayName: "",
  hapticsEnabled: true,
  optionsCommissionPerContract: 0.65,
  optionsProfitTargetPct: 50,
  optionsStopLossPct: 200,
  zeroDteHardExitEt: "15:30",
  ivrSource: "broker",
  earningsPlayMode: "warn",
  tradeLogMarketFilter: "all",
};

const listeners = new Set<(p: LocalPrefs) => void>();

export function getLocalPrefs(): LocalPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<LocalPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setLocalPrefs(patch: Partial<LocalPrefs>) {
  if (typeof window === "undefined") return;
  const next = { ...getLocalPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(next);
}

export function useLocalPrefs() {
  const [prefs, setPrefs] = useState<LocalPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    setPrefs(getLocalPrefs());
    const l = (p: LocalPrefs) => setPrefs(p);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return [prefs, setLocalPrefs] as const;
}