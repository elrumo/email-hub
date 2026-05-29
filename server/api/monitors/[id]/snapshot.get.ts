import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { monitors } from '../../../db/schema'
import { acquireClient } from '../../../engine/clientPool'
import { resolveConnection } from '../../../engine/connections'
import { getAction, getIntegration } from '../../../engine/registry'
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

  const integration = getIntegration(m.integrationId)
  if (!integration?.monitoring) {
    return { ok: false, error: `${m.integrationId} no longer supports monitoring` }
  }
  const action = getAction(m.integrationId, integration.monitoring.snapshotAction)
  if (!action) {
    return { ok: false, error: 'monitoring action unavailable' }
  }

  const connection = await resolveConnection(db, m.connectionId, user.id)
  const signal = (event.node.req as unknown as { signal?: AbortSignal }).signal ?? new AbortController().signal
  try {
    const client = connection ? await acquireClient(connection, signal) : null
    // thread the monitor id in for integrations (e.g. ping) whose snapshot reads
    // its own time-series; others simply ignore the extra key.
    const input = { ...m.targetConfig, _monitorId: m.id }
    const snapshot = await action.run({ connection, input, log: () => {}, signal, client })
    return { ok: true, ...snapshot }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})
