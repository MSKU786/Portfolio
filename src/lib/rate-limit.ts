type Window = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 15;

/**
 * Per-process fixed-window limiter.
 *
 * Deliberately in-memory: this guards a personal site's demo endpoint, and the
 * traffic never justifies a Redis dependency. The tradeoff is that the budget
 * is per serverless instance rather than global — swap in a shared store if
 * this ever needs to be authoritative.
 */
const windows = new Map<string, Window>();

export type RateLimitVerdict = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(key: string): RateLimitVerdict {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    // Opportunistic sweep so the map can't grow without bound.
    if (windows.size > 5_000) {
      for (const [entryKey, entry] of windows) {
        if (now >= entry.resetAt) windows.delete(entryKey);
      }
    }
    return {
      allowed: true,
      remaining: MAX_REQUESTS - 1,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const allowed = existing.count <= MAX_REQUESTS;

  return {
    allowed,
    remaining: Math.max(0, MAX_REQUESTS - existing.count),
    retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
  };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "anonymous";
}
