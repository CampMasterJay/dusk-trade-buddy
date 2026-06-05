// Tracks which HIGH-impact articles the user hasn't acknowledged yet.
// Persisted in localStorage; pub/sub for the bottom-nav badge.

const KEY = "edgetrader.unreadHighImpact.v1";
const CHANGE_EVENT = "edgetrader:unread-high-impact-changed";

function isBrowser() {
  return typeof window !== "undefined";
}

function read(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(-100)));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

export function markHighImpactUnread(id: string) {
  const ids = read();
  if (ids.includes(id)) return;
  ids.push(id);
  write(ids);
}

export function markAllHighImpactRead() {
  write([]);
}

export function getUnreadHighImpactCount(): number {
  return read().length;
}

export function subscribeUnreadHighImpact(listener: (count: number) => void): () => void {
  if (!isBrowser()) return () => {};
  const handler = () => listener(getUnreadHighImpactCount());
  window.addEventListener(CHANGE_EVENT, handler);
  listener(getUnreadHighImpactCount());
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}