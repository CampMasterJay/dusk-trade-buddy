// App-wide trading mode: "futures" or "options". Persisted in localStorage.
// The logo in AppHeader toggles between them. All mode-aware surfaces
// (dashboard, trade log default filter, playbook tab, challenge archive,
// settings) read from here.

import { useEffect, useState } from "react";

export type TradingMode = "futures" | "options";

const KEY = "edgetrader.tradingMode.v1";
const EVENT = "edgetrader:tradingMode";

export function getTradingMode(): TradingMode {
  if (typeof window === "undefined") return "futures";
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "options" ? "options" : "futures";
  } catch {
    return "futures";
  }
}

/** Sync the active mode onto <html data-mode="…"> so CSS can theme per mode. */
export function syncModeAttribute(mode: TradingMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-mode", mode);
}

export function setTradingMode(mode: TradingMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  syncModeAttribute(mode);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

export function toggleTradingMode(): TradingMode {
  const next: TradingMode = getTradingMode() === "futures" ? "options" : "futures";
  setTradingMode(next);
  return next;
}

export function useTradingMode(): [TradingMode, (m: TradingMode) => void] {
  const [mode, setMode] = useState<TradingMode>("futures");
  useEffect(() => {
    const initial = getTradingMode();
    setMode(initial);
    syncModeAttribute(initial);
    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<TradingMode>).detail;
      const next: TradingMode = d === "options" ? "options" : "futures";
      setMode(next);
      syncModeAttribute(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        const next = getTradingMode();
        setMode(next);
        syncModeAttribute(next);
      }
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [mode, setTradingMode];
}

/** Pick the matching balance fields from a user_settings row. */
export function getActiveBalance(
  settings:
    | {
        starting_balance?: number | string | null;
        current_balance?: number | string | null;
        challenge_target?: number | string | null;
        options_starting_balance?: number | string | null;
        options_current_balance?: number | string | null;
        options_challenge_target?: number | string | null;
      }
    | null
    | undefined,
  mode: TradingMode,
): { starting: number; current: number; target: number } {
  if (!settings) return { starting: 100, current: 100, target: 1000 };
  if (mode === "options") {
    const starting = Number(settings.options_starting_balance ?? 100);
    return {
      starting,
      current: Number(settings.options_current_balance ?? starting),
      target: Number(settings.options_challenge_target ?? 1000),
    };
  }
  const starting = Number(settings.starting_balance ?? 100);
  return {
    starting,
    current: Number(settings.current_balance ?? starting),
    target: Number(settings.challenge_target ?? 1000),
  };
}