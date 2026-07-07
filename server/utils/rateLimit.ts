import { createError, getRequestIP, setResponseHeader, type H3Event } from 'h3'

/**
 * Tiny in-memory fixed-window rate limiter. Good enough for a single-node
 * deployment (this app runs as one container) to blunt credential stuffing on
 * auth endpoints and accidental loops on expensive AI/send endpoints. Swap for
 * Redis if the app ever runs multi-node — the call sites won't change.
 */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

/** Occasionally sweep expired windows so the map can't grow unbounded. */
function sweep(now: number) {
  if (windows.size < 10_000) return
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key)
  }
}

export interface RateLimitOptions {
  /** max requests per window */
  limit: number
  /** window length in ms */
  windowMs: number
  /** extra key component (e.g. the target email or user id); defaults to IP only */
  key?: string
  /** message for the 429 */
  message?: string
}

/** Throw 429 when `bucket` has been hit more than `limit` times this window. */
export function assertRateLimit(event: H3Event, bucket: string, opts: RateLimitOptions): void {
  const now = Date.now()
  sweep(now)
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const key = `${bucket}:${ip}${opts.key ? `:${opts.key}` : ''}`
  const current = windows.get(key)
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + opts.windowMs })
    return
  }
  current.count += 1
  if (current.count > opts.limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    setResponseHeader(event, 'Retry-After', retryAfter)
    throw createError({
      statusCode: 429,
      statusMessage: opts.message ?? 'Too many requests — please slow down and try again shortly.'
    })
  }
}
