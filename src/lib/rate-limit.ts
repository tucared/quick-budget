/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Each key (e.g. user ID) is allowed `maxRequests` within a rolling
 * `windowMs` window.  Stale entries are lazily evicted on every call.
 *
 * This is suitable for single-process deployments (Vercel serverless
 * functions share the same isolate for warm invocations).  For
 * multi-region / multi-instance setups, swap for a Redis-backed store.
 */

interface RateLimitEntry {
  timestamps: number[]
}

interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number
  /** Window duration in milliseconds. */
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number | null
}

export function createRateLimiter({ maxRequests, windowMs }: RateLimitConfig) {
  const store = new Map<string, RateLimitEntry>()

  // Periodically purge keys that haven't been seen in over 2× the window
  // to prevent unbounded memory growth from many unique users.
  const CLEANUP_INTERVAL = windowMs * 2
  let lastCleanup = Date.now()

  function cleanup(now: number) {
    if (now - lastCleanup < CLEANUP_INTERVAL) return
    lastCleanup = now
    const cutoff = now - windowMs
    for (const [key, entry] of store) {
      if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < cutoff) {
        store.delete(key)
      }
    }
  }

  return function check(key: string): RateLimitResult {
    const now = Date.now()
    cleanup(now)

    const windowStart = now - windowMs
    let entry = store.get(key)

    if (!entry) {
      entry = { timestamps: [] }
      store.set(key, entry)
    }

    // Drop timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart)

    if (entry.timestamps.length >= maxRequests) {
      const oldestInWindow = entry.timestamps[0]
      const retryAfterMs = oldestInWindow + windowMs - now
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs,
      }
    }

    entry.timestamps.push(now)
    return {
      allowed: true,
      remaining: maxRequests - entry.timestamps.length,
      retryAfterMs: null,
    }
  }
}
