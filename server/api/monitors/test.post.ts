import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections, monitors } from '../../db/schema'
import { acquireClient } from '../../engine/clientPool'
import { resolveConnection } from '../../engine/connections'
import { getAction, getIntegration } from '../../engine/registry'
import { mergeSecrets } from '../../engine/validate'
import { registerAllIntegrations } from '../../integrations'
import type { MonitorSnapshot } from '../../engine/types'

/**
 * Test a monitor's target config without saving. Body:
 *   { connectionId, targetConfig, monitorId? }
 * Redacted/blank secrets are back-filled from the saved monitor (when editing).
 * Runs the integration's snapshotAction and reports whether it returned data.
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const body = await readBody(event)
  const connectionId = String(body?.connectionId ?? '')
  let targetConfig: Record<string, unknown> = (body?.targetConfig && typeof body.targetConfig === 'object') ? body.targetConfig : {}

  const db = getDb()
  const conn = (await db.select().from(connections).where(eq(connections.id, connectionId)))[0]
  if (!conn) return { ok: false, message: 'Pick a valid connection first.' }

  const integration = getIntegration(conn.integrationId)
  if (!integration?.monitoring) return { ok: false, message: `${conn.integrationId} connections can't be monitored` }

  if (body?.monitorId) {
    const existing = (await db.select().from(monitors).where(eq(monitors.id, String(body.monitorId))))[0]
    if (existing) targetConfig = mergeSecrets(targetConfig, existing.targetConfig, integration.monitoring.targetSchema)
  }

  const action = getAction(conn.integrationId, integration.monitoring.snapshotAction)!
  const connection = await resolveConnection(db, connectionId)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 10_000)
  try {
    const client = connection ? await acquireClient(connection, ac.signal) : null
    const snapshot = await action.run({ connection, input: targetConfig, log: () => {}, signal: ac.signal, client }) as unknown as MonitorSnapshot
    if (snapshot.kind === 'status') {
      return { ok: true, message: `Reachable — status: ${snapshot.label}.` }
    }
    const hasData = snapshot.gauges.some(g => g.value != null)
    return {
      ok: true,
      message: hasData ? 'Reachable — metrics returned.' : 'Reachable, but no metric data was returned yet.'
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Test failed' }
  } finally {
    clearTimeout(timer)
  }
})
