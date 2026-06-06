/**
 * Retry an async operation with exponential backoff.
 * Default schedule: 1s, 2s, 4s — max 3 retries (4 total attempts).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: {
    retries?: number;
    baseMs?: number;
    maxMs?: number;
    shouldRetry?: (err: unknown, attempt: number) => boolean;
    onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 1000;
  const maxMs = opts.maxMs ?? 8000;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || (opts.shouldRetry && !opts.shouldRetry(err, attempt))) {
        throw err;
      }
      const delay = Math.min(maxMs, baseMs * 2 ** attempt);
      opts.onRetry?.(err, attempt + 1, delay);
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    }
  }
  throw lastErr;
}

export class TimeoutError extends Error {
  constructor(ms: number, label?: string) {
    super(
      label
        ? `${label} timed out after ${Math.round(ms / 1000)}s`
        : `Request timed out after ${Math.round(ms / 1000)}s`,
    );
    this.name = "TimeoutError";
  }
}

/** Race a promise against a timeout. Default 15s. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms = 15_000,
  label?: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(ms, label)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * fetch wrapper with AbortController timeout (default 15s).
 * Throws TimeoutError on expiry so callers can show a friendly message.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number; label?: string } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, label, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new TimeoutError(timeoutMs, label);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}