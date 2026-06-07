// Real-time behavioral alerts shown before opening the chart analyzer or
// new-trade form. Settings + dismissal log are stored in localStorage.

import type { Trade } from "@/lib/tradeService";

const SETTINGS_KEY = "edgetrader.behaviorAlerts.settings.v1";
const LOG_KEY = "edgetrader.behaviorAlerts.log.v1";
const BREAK_KEY = "edgetrader.behaviorAlerts.breakUntil.v1";

export type BehaviorAlertType = "tilt" | "overtrading" | "streak" | "time";

export type BehaviorAlertSettings = {
  tilt: boolean;
  overtrading: boolean;
  streak: boolean;
  time: boolean;
};

export const DEFAULT_BEHAVIOR_ALERT_SETTINGS: BehaviorAlertSettings = {
  tilt: true,
  overtrading: true,
  streak: true,
  time: true,
};

export type BehaviorAlertLogEntry = {
  ts: string; // ISO
  type: BehaviorAlertType;
  action: "override" | "break" | "dismiss";
};

export type BehaviorAlert = {
  id: string;
  type: BehaviorAlertType;
  severity: "red" | "amber";
  title: string;
  message: string;
  showBreakButton?: boolean;
};

const listeners = new Set<(s: BehaviorAlertSettings) => void>();

export function getBehaviorAlertSettings(): BehaviorAlertSettings {
  if (typeof window === "undefined") return DEFAULT_BEHAVIOR_ALERT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_BEHAVIOR_ALERT_SETTINGS;
    return {
      ...DEFAULT_BEHAVIOR_ALERT_SETTINGS,
      ...(JSON.parse(raw) as Partial<BehaviorAlertSettings>),
    };
  } catch {
    return DEFAULT_BEHAVIOR_ALERT_SETTINGS;
  }
}

export function setBehaviorAlertSettings(patch: Partial<BehaviorAlertSettings>) {
  if (typeof window === "undefined") return;
  const next = { ...getBehaviorAlertSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(next);
}

export function subscribeBehaviorAlertSettings(
  listener: (s: BehaviorAlertSettings) => void,
): () => void {
  listeners.add(listener);
  listener(getBehaviorAlertSettings());
  return () => {
    listeners.delete(listener);
  };
}

export function getBehaviorAlertLog(): BehaviorAlertLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BehaviorAlertLogEntry[];
  } catch {
    return [];
  }
}

export function logBehaviorAlertAction(
  type: BehaviorAlertType,
  action: BehaviorAlertLogEntry["action"],
) {
  if (typeof window === "undefined") return;
  const list = getBehaviorAlertLog();
  list.push({ ts: new Date().toISOString(), type, action });
  // Cap to last 500 entries
  const trimmed = list.slice(-500);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export function setBreakUntil(ms: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BREAK_KEY, String(ms));
  } catch {
    /* ignore */
  }
}

export function getBreakUntil(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BREAK_KEY);
    if (!raw) return null;
    const ms = Number(raw);
    if (!Number.isFinite(ms) || ms < Date.now()) return null;
    return ms;
  } catch {
    return null;
  }
}

// --- helpers ---

function ctDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function ctHour(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
}

function fmtHourCT(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12} ${ampm} CT`;
}

// Sort newest last
function sortedByTime(trades: Trade[]): Trade[] {
  return [...trades].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/**
 * Compute applicable behavioral alerts given a user's trade history.
 * `now` defaults to current time and is used to pick today's session + hour.
 */
export function computeBehaviorAlerts(
  trades: Trade[],
  settings: BehaviorAlertSettings = getBehaviorAlertSettings(),
  now: Date = new Date(),
): BehaviorAlert[] {
  const alerts: BehaviorAlert[] = [];
  if (!trades || trades.length === 0) return alerts;

  const sorted = sortedByTime(trades);
  const todayKey = ctDateKey(now.toISOString());
  const todays = sorted.filter((t) => ctDateKey(t.created_at) === todayKey);
  const todaysWL = todays.filter((t) => t.result === "Win" || t.result === "Loss");

  // Last consecutive wins/losses across full history (used for streak check
  // when applicable; tilt uses today-only as per spec).
  let consecLossesToday = 0;
  for (let i = todaysWL.length - 1; i >= 0; i--) {
    if (todaysWL[i].result === "Loss") consecLossesToday++;
    else break;
  }

  let consecWinsAll = 0;
  const allWL = sorted.filter((t) => t.result === "Win" || t.result === "Loss");
  for (let i = allWL.length - 1; i >= 0; i--) {
    if (allWL[i].result === "Win") consecWinsAll++;
    else break;
  }

  // ---- TILT ALERT ----
  if (settings.tilt && consecLossesToday >= 2) {
    // Historical win rate of trades where consecutive_losses_before >= 2
    const sample = allWL.filter((t) => (t.consecutive_losses_before ?? 0) >= 2);
    const wr = sample.length
      ? sample.filter((t) => t.result === "Win").length / sample.length
      : null;
    alerts.push({
      id: "tilt",
      type: "tilt",
      severity: "red",
      title: "Tilt Risk",
      message: `You've lost ${consecLossesToday} in a row today. ${
        wr != null
          ? `Your historical win rate after this is ${Math.round(wr * 100)}%.`
          : `Not enough history yet for a baseline.`
      } Take a 30-min break before next trade.`,
      showBreakButton: true,
    });
  }

  // ---- OVERTRADING ALERT ----
  if (settings.overtrading) {
    const tradesToday = todays.length;
    const nextSessionNum = tradesToday + 1;
    if (nextSessionNum >= 3) {
      const sample = allWL.filter((t) => (t.session_trade_number ?? 0) >= 3);
      const wr = sample.length
        ? sample.filter((t) => t.result === "Win").length / sample.length
        : null;
      alerts.push({
        id: "overtrading",
        type: "overtrading",
        severity: "amber",
        title: `Trade #${nextSessionNum}`,
        message:
          wr != null
            ? `Your historical win rate on 3rd+ trades is ${Math.round(
                wr * 100,
              )}%. Recommended: stop for today.`
            : `This would be your ${nextSessionNum}rd trade today. Recommended: stop for today.`,
      });
    }
  }

  // ---- STREAK ALERT ----
  if (settings.streak && consecWinsAll >= 3) {
    alerts.push({
      id: "streak",
      type: "streak",
      severity: "amber",
      title: `${consecWinsAll}-Win Streak`,
      message:
        "Traders often overtrade after wins. Confirm this setup meets all your criteria before entering.",
    });
  }

  // ---- TIME ALERT ----
  if (settings.time) {
    const currentHour = ctHour(now.toISOString());
    // Find user's worst hour with >= 3 trades
    const byHour = new Map<number, { wins: number; total: number }>();
    for (const t of allWL) {
      const h = t.hour_of_day ?? ctHour(t.created_at);
      const e = byHour.get(h) ?? { wins: 0, total: 0 };
      e.total++;
      if (t.result === "Win") e.wins++;
      byHour.set(h, e);
    }
    let worstHour: number | null = null;
    let worstWr = 1;
    for (const [h, e] of byHour) {
      if (e.total < 3) continue;
      const wr = e.wins / e.total;
      if (wr < worstWr) {
        worstWr = wr;
        worstHour = h;
      }
    }
    if (worstHour != null && currentHour === worstHour && worstWr < 0.5) {
      alerts.push({
        id: "time",
        type: "time",
        severity: "amber",
        title: `Weak Hour (${fmtHourCT(currentHour)})`,
        message: `Your win rate at this time is only ${Math.round(
          worstWr * 100,
        )}% based on your history.`,
      });
    }
  }

  return alerts;
}

/**
 * Compute "Alert Override Rate" stats: for each override action in the log,
 * find the next user trade after that timestamp and check its result.
 */
export function computeOverrideStats(
  trades: Trade[],
  log: BehaviorAlertLogEntry[] = getBehaviorAlertLog(),
): Record<BehaviorAlertType, { overrides: number; losses: number; lossRate: number | null }> {
  const out: Record<BehaviorAlertType, { overrides: number; losses: number; lossRate: number | null }> = {
    tilt: { overrides: 0, losses: 0, lossRate: null },
    overtrading: { overrides: 0, losses: 0, lossRate: null },
    streak: { overrides: 0, losses: 0, lossRate: null },
    time: { overrides: 0, losses: 0, lossRate: null },
  };
  const sorted = sortedByTime(trades);
  for (const entry of log) {
    if (entry.action !== "override") continue;
    out[entry.type].overrides++;
    const t = sorted.find(
      (tr) => new Date(tr.created_at).getTime() >= new Date(entry.ts).getTime(),
    );
    if (t && t.result === "Loss") out[entry.type].losses++;
  }
  for (const k of Object.keys(out) as BehaviorAlertType[]) {
    const o = out[k];
    o.lossRate = o.overrides > 0 ? o.losses / o.overrides : null;
  }
  return out;
}