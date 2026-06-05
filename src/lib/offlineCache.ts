// Offline cache layer backed by IndexedDB (idb-keyval).
//
// Responsibilities:
// - Cache trade lists / stats so the UI works while offline
// - Queue trade inserts created offline and flush them when reconnected
// - Cache the latest news articles for offline reading
// - Track the last successful sync time (used by Settings)

import { get, set, del, createStore } from "idb-keyval";
import type { TradeInsert } from "@/lib/tradeService";

const store = createStore("edgetrader-offline", "kv");

// ---------- keys ----------
const K_TRADES = (uid: string) => `trades:${uid}`;
const K_STATS = (uid: string) => `stats:${uid}`;
const K_QUEUE = (uid: string) => `queue:trades:${uid}`;
const K_NEWS = "news:articles";
const K_LAST_SYNC = "lastSync";

// ---------- generic helpers ----------
async function safeGet<T>(key: string): Promise<T | null> {
  try {
    const v = await get<T>(key, store);
    return v ?? null;
  } catch {
    return null;
  }
}
async function safeSet<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, value, store);
  } catch {
    /* quota / private mode — non-fatal */
  }
}

// ---------- last sync ----------
export async function markSynced(): Promise<void> {
  await safeSet(K_LAST_SYNC, Date.now());
}
export async function getLastSync(): Promise<number | null> {
  return safeGet<number>(K_LAST_SYNC);
}

// ---------- trades cache ----------
export async function cacheTrades<T>(userId: string, trades: T): Promise<void> {
  await safeSet(K_TRADES(userId), trades);
  await markSynced();
}
export async function readCachedTrades<T>(userId: string): Promise<T | null> {
  return safeGet<T>(K_TRADES(userId));
}
export async function cacheStats<T>(userId: string, stats: T): Promise<void> {
  await safeSet(K_STATS(userId), stats);
}
export async function readCachedStats<T>(userId: string): Promise<T | null> {
  return safeGet<T>(K_STATS(userId));
}

// ---------- offline trade queue ----------
export type QueuedTrade = {
  id: string; // local temp id
  trade: TradeInsert;
  queuedAt: number;
};

export async function queueTrade(
  userId: string,
  trade: TradeInsert,
): Promise<QueuedTrade> {
  const queue = (await safeGet<QueuedTrade[]>(K_QUEUE(userId))) ?? [];
  const entry: QueuedTrade = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trade,
    queuedAt: Date.now(),
  };
  queue.push(entry);
  await safeSet(K_QUEUE(userId), queue);
  return entry;
}

export async function getQueuedTrades(userId: string): Promise<QueuedTrade[]> {
  return (await safeGet<QueuedTrade[]>(K_QUEUE(userId))) ?? [];
}

export async function removeQueuedTrade(
  userId: string,
  id: string,
): Promise<void> {
  const queue = (await safeGet<QueuedTrade[]>(K_QUEUE(userId))) ?? [];
  await safeSet(
    K_QUEUE(userId),
    queue.filter((q) => q.id !== id),
  );
}

export async function clearQueue(userId: string): Promise<void> {
  try {
    await del(K_QUEUE(userId), store);
  } catch {
    /* noop */
  }
}

// Flush every queued trade for this user. Returns counts.
export async function flushQueuedTrades(
  userId: string,
): Promise<{ synced: number; failed: number }> {
  const queue = await getQueuedTrades(userId);
  if (queue.length === 0) return { synced: 0, failed: 0 };

  // Lazy import to avoid a circular module load.
  const { createTradeRemote } = await import("@/lib/tradeService");
  let synced = 0;
  let failed = 0;
  for (const item of queue) {
    const { error } = await createTradeRemote(item.trade);
    if (error) {
      failed++;
    } else {
      synced++;
      await removeQueuedTrade(userId, item.id);
    }
  }
  if (synced > 0) await markSynced();
  return { synced, failed };
}

// ---------- news cache ----------
export async function cacheNewsArticles<T>(articles: T[]): Promise<void> {
  await safeSet(K_NEWS, articles.slice(0, 20));
}
export async function readCachedNews<T>(): Promise<T[] | null> {
  return safeGet<T[]>(K_NEWS);
}

// ---------- formatting ----------
export function formatLastSync(ts: number | null): string {
  if (!ts) return "Never synced";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Last synced just now";
  if (mins < 60) return `Last synced ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last synced ${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `Last synced ${days} day${days === 1 ? "" : "s"} ago`;
}