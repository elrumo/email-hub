import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { monitors } from '../../../db/schema'
import { snapshotMonitor } from '../_snapshot'
import { registerAllIntegrations } from '../../../integrations'
import { requireUser } from '../../../utils/auth'

/**
 * On-demand snapshot for one monitor. Resolves the connection and runs the
 * integration's `monitoring.snapshotAction` with the monitor's targetConfig as
 * input; returns the normalized MonitorSnapshot (kind: "gauges" | "status").
 *
 * Failures are returned as { ok: false, error } (not HTTP errors) so the card
 * can render the reason inline (e.g. monitoring not enabled, monitor missing).
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const m = (await db.select().from(monitors).where(and(eq(monitors.id, id), eq(monitors.ownerId, user.id))))[0]
  if (!m) throw createError({ statusCode: 404, statusMessage: 'monitor not found' })

  const signal = (event.node.req as unknown as { signal?: AbortSignal }).signal ?? new AbortController().signal
  return snapshotMonitor(db, m, user.id, signal)
})
