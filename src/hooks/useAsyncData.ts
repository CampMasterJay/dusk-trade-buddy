import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
};

/**
 * Strict async data loader.
 * - Sets `loading=true` BEFORE the fetch starts
 * - Sets `loading=false` in `finally` (success or error)
 * - Never returns stale `data` alongside a new error without surfacing the error
 * - Cancels stale results on unmount / dep change
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const reqId = useRef(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Keep latest fetcher in a ref so changing closures don't re-trigger.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await fetcherRef.current();
        if (id !== reqId.current) return;
        setData(result);
      } catch (err) {
        if (id !== reqId.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    })();
    return () => {
      // Invalidate any in-flight result for this effect.
      reqId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps]);

  // Listen for global refresh events.
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("edgetrader:refresh", handler);
    return () => window.removeEventListener("edgetrader:refresh", handler);
  }, [refresh]);

  return { data, loading, error, refresh };
}