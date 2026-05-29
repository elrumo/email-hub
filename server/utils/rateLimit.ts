/**
 * Tiny in-memory fixed-window rate limiter. Fine for a single-container,
 * single-process self-hosted app (state is per-process and resets on restart) —
 * it exists to blunt accidental/abusive hammering of public endpoints, not as a
 * hard security control. Keyed by an arbitrary string (e.g. `flow:<id>`).
 */
const hits = new Map<string, { count: number, resetAt: number }>()

/**
 * Returns true if the action is allowed under `limit` calls per `windowMs`,
 * false if the caller has exceeded it. Counts the call when allowed.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = hits.get(key)
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}
