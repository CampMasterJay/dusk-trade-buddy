// Thin wrapper around navigator.vibrate() with named patterns.
// Respects the user's haptics toggle (localPrefs.hapticsEnabled) and
// silently no-ops on unsupported devices (desktop, iOS Safari).

import { useCallback } from "react";
import { getLocalPrefs } from "@/lib/localPrefs";

export type HapticPattern =
  | "tradeLogged"
  | "win"
  | "loss"
  | "milestone"
  | "newsAlert"
  | "tap"
  | "error";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tradeLogged: 50,
  win: [50, 80, 50],
  loss: 200,
  milestone: [40, 40, 40, 40, 120, 60, 200],
  newsAlert: [80, 40, 80, 40, 200],
  tap: 20,
  error: [100, 50, 100],
};

function supportsVibrate(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

export function triggerHaptic(pattern: HapticPattern): void {
  if (!supportsVibrate()) return;
  if (!getLocalPrefs().hapticsEnabled) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    /* noop */
  }
}

export function useHaptic() {
  const trigger = useCallback((pattern: HapticPattern) => {
    triggerHaptic(pattern);
  }, []);
  return { trigger, supported: supportsVibrate() };
}