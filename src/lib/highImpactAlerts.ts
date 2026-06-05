// Module-level pub/sub store for global HIGH impact news alerts.
// Persists the current alert in sessionStorage so it survives client-side navigation.

export type HighImpactAlert = {
  id: string;
  headline: string;
  publishedAt: number; // ms epoch when alert was raised
  url?: string;
};

const STORAGE_KEY = "edgetrader.highImpactAlert.v1";
const DISMISSED_KEY = "edgetrader.highImpactAlert.dismissed.v1";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

type Listener = (alert: HighImpactAlert | null) => void;
const listeners = new Set<Listener>();
let current: HighImpactAlert | null = null;
let expireTimer: ReturnType<typeof setTimeout> | null = null;

function readStored(): HighImpactAlert | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HighImpactAlert;
    if (Date.now() - parsed.publishedAt > TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(alert: HighImpactAlert | null) {
  if (typeof window === "undefined") return;
  try {
    if (alert) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(alert));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function isDismissed(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const ids = JSON.parse(raw) as string[];
    return ids.includes(id);
  } catch {
    return false;
  }
}

function markDismissed(id: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(id)) ids.push(id);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    // ignore
  }
}

function notify() {
  for (const l of listeners) l(current);
}

function scheduleExpiry() {
  if (expireTimer) clearTimeout(expireTimer);
  if (!current) return;
  const remaining = current.publishedAt + TTL_MS - Date.now();
  if (remaining <= 0) {
    current = null;
    writeStored(null);
    notify();
    return;
  }
  expireTimer = setTimeout(() => {
    current = null;
    writeStored(null);
    notify();
  }, remaining);
}

export function getCurrentAlert(): HighImpactAlert | null {
  if (!current) current = readStored();
  return current;
}

export function publishHighImpactAlert(input: {
  id: string;
  headline: string;
  url?: string;
}) {
  if (typeof window === "undefined") return;
  if (isDismissed(input.id)) return;
  // Skip if same alert already active.
  if (current && current.id === input.id) return;
  current = {
    id: input.id,
    headline: input.headline,
    url: input.url,
    publishedAt: Date.now(),
  };
  writeStored(current);
  // Subtle vibration on mobile.
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // ignore
  }
  scheduleExpiry();
  notify();
}

export function dismissCurrentAlert() {
  if (!current) return;
  markDismissed(current.id);
  current = null;
  writeStored(null);
  if (expireTimer) {
    clearTimeout(expireTimer);
    expireTimer = null;
  }
  notify();
}

export function subscribeHighImpactAlert(listener: Listener): () => void {
  listeners.add(listener);
  // Hydrate from storage on first subscribe.
  if (!current) current = readStored();
  if (current) scheduleExpiry();
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}