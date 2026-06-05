// Tiny stale-while-revalidate helper backed by sessionStorage.
// Returns cached value instantly (if present) and fires a background
// revalidation. Useful for view-level fetches that don't justify
// pulling in TanStack Query at the component level.

import { useCallback, useEffect, useRef, useState } from "react";

type Entry<T> = { data: T; ts: number };

function read<T>(key: string): Entry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as Entry<T>;
  } catch {
    return null;
  }
}

function write<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() } satisfies Entry<T>));
  } catch {
    /* quota / serialization errors are non-fatal */
  }
}

export function useSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { staleMs?: number; refreshIntervalMs?: number },
) {
  const staleMs = options?.staleMs ?? 60_000;
  const refreshIntervalMs = options?.refreshIntervalMs;

  const cached = read<T>(key);
  const [data, setData] = useState<T | null>(cached?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const revalidate = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const next = await fetcherRef.current();
      setData(next);
      write(key, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setRefreshing(false);
    }
  }, [key]);

  useEffect(() => {
    const c = read<T>(key);
    if (!c || Date.now() - c.ts > staleMs) {
      void revalidate();
    }
    if (!refreshIntervalMs) return;
    const id = setInterval(() => void revalidate(), refreshIntervalMs);
    return () => clearInterval(id);
  }, [key, staleMs, refreshIntervalMs, revalidate]);

  return { data, error, refreshing, revalidate, isStale: !cached };
}