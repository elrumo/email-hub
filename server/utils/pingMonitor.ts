import { randomUUID } from 'node:crypto'
import { and, asc, eq, lt } from 'drizzle-orm'
import { getDb } from '../db'
import { monitors, pingSamples, type PingSampleRow } from '../db/schema'

/**
 * Constant-ping monitors.
 *
 * Unlike Dokploy/Kuma monitors — which the Monitoring page snapshots on demand —
 * a ping monitor (integrationId === "ping") is a *constant* check: a server-side
 * loop pings its target URL on the configured interval, for the configured
 * duration, and records each result in `ping_samples`. The integration's
 * `monitorSnapshot` action then reads the latest sample (current up/down) plus a
 * recent window (latency series) for the page.
 *
 * The driver is `pingMonitorTick`, run from the scheduler (server/plugins/
 * engine.ts) on the same internal interval as flows. Because that tick interval
 * (~30s) can be coarser than a monitor's requested ping interval, each tick
 * fires *as many* pings as are due since the monitor's last sample — spaced by
 * the interval, bounded per tick so one monitor can't monopolise a tick.
 */

/** Reserved keys in a ping monitor's targetConfig (the rest are request fields). */
interface PingTargetConfig {
  url?: unknown
  intervalSeconds?: unknown
  durationMinutes?: unknown
  successRule?: unknown
}

/** Most a single monitor may ping within one tick (caps catch-up bursts). */
const MAX_PINGS_PER_TICK = 20
/** Keep at most this many samples per monitor (older rows pruned each tick). */
const RETAIN_SAMPLES = 500
/** Floor on interval so a misconfigured "0" can't hammer the target every tick. */
const MIN_INTERVAL_MS = 1000

/** Read the most recent `limit` samples for a monitor, oldest→newest. */
export async function readPingSamples(monitorId: string, limit = 120): Promise<PingSampleRow[]> {
  const db = getDb()
  // grab the newest `limit` by ts desc, then reverse to chronological order
  const rows = await db
    .select()
    .from(pingSamples)
    .where(eq(pingSamples.monitorId, monitorId))
    .orderBy(asc(pingSamples.ts))
  return rows.slice(-limit)
}

/**
 * Run one tick of every active ping monitor. For each monitor still inside its
 * run window, fire whatever pings are due since its last sample and append them.
 * Per-monitor errors are swallowed (logged) so one bad target can't stall the
 * loop. Safe to call when there are no ping monitors (no-op).
 */
export async function pingMonitorTick(now: number, signal: AbortSignal): Promise<void> {
  const db = getDb()
  const rows = await db.select().from(monitors).where(eq(monitors.integrationId, 'ping'))
  if (!rows.length) return

  // helpers live in the integration module; import lazily to avoid a load-time
  // import cycle (ping.ts imports readPingSamples from here).
  const { buildRequest, execute, pingSuccess } = await import('../integrations/ping')

  for (const m of rows) {
    try {
      const cfg = (m.targetConfig ?? {}) as PingTargetConfig & Record<string, unknown>
      const intervalMs = Math.max(MIN_INTERVAL_MS, Math.round(Number(cfg.intervalSeconds ?? 30) * 1000) || 30_000)
      const durationMin = Number(cfg.durationMinutes ?? 0) || 0
      const successRule = String(cfg.successRule ?? '2xx3xx')

      // run window: from createdAt for durationMin minutes (0 = forever)
      if (durationMin > 0 && now > m.createdAt + durationMin * 60_000) {
        continue // window elapsed — stop pinging (existing samples remain)
      }

      // when was this monitor last pinged?
      const lastRow = (await db
        .select({ ts: pingSamples.ts })
        .from(pingSamples)
        .where(eq(pingSamples.monitorId, m.id))
        .orderBy(asc(pingSamples.ts)))
        .at(-1)
      const lastTs = lastRow?.ts ?? 0

      // how many pings are due since lastTs (capped). The first-ever ping fires
      // immediately (lastTs 0 → due >> cap → clamps to 1 after the loop guard).
      let due = lastTs === 0 ? 1 : Math.floor((now - lastTs) / intervalMs)
      if (due <= 0) continue
      if (due > MAX_PINGS_PER_TICK) due = MAX_PINGS_PER_TICK

      const req = buildRequest(cfg)
      const newRows: typeof pingSamples.$inferInsert[] = []
      for (let i = 0; i < due; i++) {
        if (signal.aborted) break
        const res = await execute(req, signal)
        const ok = pingSuccess(res, successRule)
        newRows.push({
          id: randomUUID(),
          monitorId: m.id,
          ts: Date.now(),
          ok,
          status: res.status,
          latencyMs: res.error ? null : res.durationMs,
          error: ok ? null : (res.error || `HTTP ${res.status}`)
        })
      }
      if (newRows.length) {
        await db.insert(pingSamples).values(newRows)
        await prune(m.id)
      }
    } catch (e) {
      console.error(`[ping-monitor] ${m.id} failed:`, e instanceof Error ? e.message : e)
    }
  }
}

/** Drop all but the newest RETAIN_SAMPLES rows for a monitor. */
async function prune(monitorId: string): Promise<void> {
  const db = getDb()
  // find the cutoff ts: the RETAIN_SAMPLES-th newest. Cheap enough at this scale.
  const tss = (await db
    .select({ ts: pingSamples.ts })
    .from(pingSamples)
    .where(eq(pingSamples.monitorId, monitorId))
    .orderBy(asc(pingSamples.ts)))
    .map(r => r.ts)
  if (tss.length <= RETAIN_SAMPLES) return
  const cutoff = tss[tss.length - RETAIN_SAMPLES]!
  await db.delete(pingSamples).where(and(eq(pingSamples.monitorId, monitorId), lt(pingSamples.ts, cutoff)))
}
