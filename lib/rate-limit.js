/**
 * ---------------------------------------------------------------------------
 * In-process rate limiter
 * ---------------------------------------------------------------------------
 * Guards sensitive endpoints (login, password reset, report exports) against
 * brute-force traffic. This is a fixed-window counter kept in memory, which is
 * the right trade-off for a single Node/Vercel instance and for development.
 *
 * PRODUCTION NOTE: on serverless each instance keeps its own window. For
 * multi-region deployments replace `hits` with a shared store (e.g. Vercel KV or
 * Upstash Redis) - the `checkRateLimit` signature will not change.
 */

const DEFAULT_MAX = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 30);
const DEFAULT_WINDOW_SECONDS = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60);

const globalStore = globalThis;
if (!globalStore.__cskecRateLimits) {
  globalStore.__cskecRateLimits = new Map();
}

/** Drop expired buckets so the map cannot grow without bound. */
function sweep(now) {
  const store = globalStore.__cskecRateLimits;
  if (store.size < 5000) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

/**
 * @param {string} key   Bucket identity, usually `${scope}:${ip|email}`
 * @param {object} [options]
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }}
 */
export function checkRateLimit(key, options = {}) {
  const max = options.max ?? DEFAULT_MAX;
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const now = Date.now();
  sweep(now);

  const store = globalStore.__cskecRateLimits;
  let bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowSeconds * 1000 };
    store.set(key, bucket);
  }

  bucket.count += 1;
  const allowed = bucket.count <= max;

  return {
    allowed,
    remaining: Math.max(0, max - bucket.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Clear all buckets - used by tests. */
export function resetRateLimits() {
  globalStore.__cskecRateLimits.clear();
}

export function rateLimitHeaders(result, max = DEFAULT_MAX) {
  return {
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(result.remaining),
    ...(result.allowed ? {} : { 'Retry-After': String(result.retryAfterSeconds) }),
  };
}