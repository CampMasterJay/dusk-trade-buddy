import {
  scoreNewsBatch,
  type ImpactScore,
} from "@/lib/api/newsImpact.functions";

export type {
  ImpactScore,
  ImpactLevel,
  ImpactSentiment,
  TradingAction,
} from "@/lib/api/newsImpact.functions";

const CACHE_KEY = "edgetrader.newsImpact.v1";
const BATCH_SIZE = 5;
const MAX_PER_REFRESH = 10;

export type NewsItemInput = {
  id: string;
  headline: string;
  summary?: string;
  symbols?: string[];
};

function readCache(): Record<string, ImpactScore> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ImpactScore>) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, ImpactScore>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota or disabled — ignore
  }
}

export function getCachedImpact(id: string): ImpactScore | undefined {
  return readCache()[id];
}

export function clearImpactCache() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(CACHE_KEY);
}

/**
 * Score the top N (default 10) uncached articles in batches of 5.
 * Calls `onScored` as each score arrives so the UI can update incrementally.
 */
export async function scoreArticles(
  items: NewsItemInput[],
  onScored: (score: ImpactScore) => void,
  opts?: { limit?: number },
): Promise<{ scored: number; errors: string[] }> {
  const limit = opts?.limit ?? MAX_PER_REFRESH;
  const cache = readCache();

  // Surface already-cached results immediately.
  for (const it of items) {
    const hit = cache[it.id];
    if (hit) onScored(hit);
  }

  // Only request scores for uncached items, capped at `limit`.
  const todo = items.filter((it) => !cache[it.id]).slice(0, limit);
  const errors: string[] = [];
  let scored = 0;

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    try {
      const res = await scoreNewsBatch({ data: { items: batch } });
      if (!res.ok) {
        errors.push(res.error);
        continue;
      }
      for (const s of res.scores) {
        cache[s.id] = s;
        scored += 1;
        onScored(s);
      }
      writeCache(cache);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return { scored, errors };
}

/** Set of article IDs currently being scored — caller tracks UI state. */
export function pendingIdsFor(items: NewsItemInput[], limit = MAX_PER_REFRESH): Set<string> {
  const cache = readCache();
  return new Set(items.filter((it) => !cache[it.id]).slice(0, limit).map((it) => it.id));
}