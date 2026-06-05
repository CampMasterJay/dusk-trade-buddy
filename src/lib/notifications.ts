// Client-side notification system for EdgeTrader.
//
// Scope: works while the app is open (foreground or background tab / installed
// PWA). True push-when-closed delivery requires a backend (VAPID + push
// subscriptions) and is out of scope here.
//
// Triggers covered:
//   1. Market open reminder — 8:25 AM CT on weekdays
//   2. HIGH impact news — bridged from highImpactAlerts pub/sub
//   3. Daily loss limit warning — checked when balance/trades change
//   4. Challenge milestones — 25%, 50%, 75%, 100%

import { subscribeHighImpactAlert } from "./highImpactAlerts";

const SETTINGS_KEY = "edgetrader.notifications.v1";
const DEDUPE_KEY = "edgetrader.notifications.dedupe.v1";

export type NotificationSettings = {
  enabled: boolean;
  marketOpen: boolean;
  news: boolean;
  lossLimit: boolean;
  milestones: boolean;
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  marketOpen: true,
  news: true,
  lossLimit: true,
  milestones: true,
};

export function getNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<NotificationSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const settingsListeners = new Set<(s: NotificationSettings) => void>();

export function setNotificationSettings(patch: Partial<NotificationSettings>) {
  if (typeof window === "undefined") return;
  const next = { ...getNotificationSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  for (const l of settingsListeners) l(next);
}

export function subscribeNotificationSettings(
  listener: (s: NotificationSettings) => void,
): () => void {
  settingsListeners.add(listener);
  listener(getNotificationSettings());
  return () => settingsListeners.delete(listener);
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || typeof Notification === "undefined")
    return "denied";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || typeof Notification === "undefined")
    return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") {
      setNotificationSettings({ enabled: true });
    }
    return result;
  } catch {
    return "denied";
  }
}

// --- Dedupe (avoid double-firing the same event in a session) ---

function getDedupe(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DEDUPE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function setDedupe(key: string) {
  if (typeof window === "undefined") return;
  try {
    const map = getDedupe();
    map[key] = Date.now();
    // Prune entries older than 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const k of Object.keys(map)) {
      if (map[k] < cutoff) delete map[k];
    }
    localStorage.setItem(DEDUPE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function alreadyFired(key: string): boolean {
  return Boolean(getDedupe()[key]);
}

// --- Notification display ---

export type NotifyOptions = {
  body: string;
  tag?: string;
  href?: string;
  silent?: boolean;
};

export async function notify(title: string, opts: NotifyOptions): Promise<void> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const settings = getNotificationSettings();
  if (!settings.enabled) return;

  const payload: NotificationOptions = {
    body: opts.body,
    tag: opts.tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    silent: opts.silent,
  };

  // Prefer the service worker (works when tab is unfocused / installed PWA backgrounded).
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, payload);
        return;
      }
    }
  } catch {
    /* fall through to in-page Notification */
  }

  try {
    const n = new Notification(title, payload);
    if (opts.href) {
      n.onclick = () => {
        window.focus();
        window.location.href = opts.href!;
        n.close();
      };
    }
  } catch {
    /* ignore */
  }
}

// --- Triggers ---

let triggersStarted = false;
let marketOpenTimer: ReturnType<typeof setInterval> | null = null;
let newsUnsubscribe: (() => void) | null = null;

function todayKey(prefix: string): string {
  const d = new Date();
  return `${prefix}:${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

// Returns true when current time (UTC) is within the 8:25-8:30 AM CT window
// on a weekday. CT = UTC-6 (standard) or UTC-5 (DST). We accept either; we
// just check whether the local "America/Chicago" time matches.
function isMarketOpenReminderWindow(now: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  return isWeekday && hour === 8 && minute >= 25 && minute <= 30;
}

function startMarketOpenTrigger() {
  if (marketOpenTimer) return;
  const check = () => {
    const settings = getNotificationSettings();
    if (!settings.enabled || !settings.marketOpen) return;
    const now = new Date();
    if (!isMarketOpenReminderWindow(now)) return;
    const key = todayKey("marketOpen");
    if (alreadyFired(key)) return;
    setDedupe(key);
    void notify("NY Open in 5 minutes", {
      body: "Check your watchlist before the session opens.",
      tag: "market-open",
      href: "/news",
    });
  };
  check();
  marketOpenTimer = setInterval(check, 60 * 1000);
}

function startNewsTrigger() {
  if (newsUnsubscribe) return;
  newsUnsubscribe = subscribeHighImpactAlert((alert) => {
    if (!alert) return;
    const settings = getNotificationSettings();
    if (!settings.enabled || !settings.news) return;
    const key = `news:${alert.id}`;
    if (alreadyFired(key)) return;
    setDedupe(key);
    void notify("⚠️ HIGH IMPACT NEWS", {
      body: alert.headline,
      tag: `news-${alert.id}`,
      href: alert.url ?? "/news",
    });
  });
}

/**
 * Initialise time-based + news triggers. Call once after auth is ready.
 * Balance-driven triggers (loss limit, milestones) are reported per-update via
 * `reportBalanceUpdate` from the dashboard, which already has the data.
 */
export function startNotificationTriggers() {
  if (typeof window === "undefined" || triggersStarted) return;
  triggersStarted = true;
  startMarketOpenTrigger();
  startNewsTrigger();
}

// --- Balance / milestones (called from Dashboard) ---

export type BalanceSnapshot = {
  startingBalance: number;
  currentBalance: number;
  targetBalance: number;
  /** Daily loss limit as a percentage of the starting balance (default 5%). */
  dailyLossPct?: number;
  /** Net P&L for today, in dollars (negative when losing). */
  todayPnl?: number;
};

export function reportBalanceUpdate(snap: BalanceSnapshot) {
  const settings = getNotificationSettings();
  if (!settings.enabled) return;

  // Daily loss limit
  if (settings.lossLimit && snap.todayPnl != null) {
    const limitPct = snap.dailyLossPct ?? 5;
    const limitDollar = (snap.startingBalance * limitPct) / 100;
    const lossDollar = Math.max(0, -snap.todayPnl);
    if (lossDollar > 0 && lossDollar >= limitDollar * 0.8) {
      const key = todayKey(
        lossDollar >= limitDollar ? "loss:hit" : "loss:warn",
      );
      if (!alreadyFired(key)) {
        setDedupe(key);
        void notify(
          lossDollar >= limitDollar
            ? "🛑 Daily loss limit reached"
            : "⚠️ Approaching daily loss limit",
          {
            body: `Down $${lossDollar.toFixed(0)} today (limit $${limitDollar.toFixed(0)}). Consider stopping.`,
            tag: "loss-limit",
            href: "/",
          },
        );
      }
    }
  }

  // Challenge milestones: 25 / 50 / 75 / 100%
  if (settings.milestones) {
    const denom = snap.targetBalance - snap.startingBalance;
    if (denom > 0) {
      const pct = ((snap.currentBalance - snap.startingBalance) / denom) * 100;
      for (const milestone of [25, 50, 75, 100]) {
        if (pct >= milestone) {
          const key = `milestone:${milestone}:${snap.targetBalance}`;
          if (!alreadyFired(key)) {
            setDedupe(key);
            void notify(`🎯 ${milestone}% to your target`, {
              body: `You're at $${snap.currentBalance.toFixed(0)} of $${snap.targetBalance.toFixed(0)}. Keep your discipline.`,
              tag: `milestone-${milestone}`,
              href: "/",
            });
          }
        }
      }
    }
  }
}