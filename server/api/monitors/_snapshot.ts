import type { DB } from '../../db'
import type { MonitorRow } from '../../db/schema'
import { acquireClient } from '../../engine/clientPool'
import { resolveConnection } from '../../engine/connections'
import { getAction, getIntegration } from '../../engine/registry'
import type { MonitorSnapshot } from '../../engine/types'

export type SnapshotResponse
  = | ({ ok: true } & MonitorSnapshot)
    | { ok: false, error: string }

/**
 * Resolve a monitor's connection and return its normalized live snapshot.
 * Failures come back as `{ ok: false, error }` so callers can render inline
 * feedback instead of surfacing transport errors.
 */
export async function snapshotMonitor(
  db: DB,
  monitor: MonitorRow,
  ownerId: string,
  signal: AbortSignal
): Promise<SnapshotResponse> {
  const integration = getIntegration(monitor.integrationId)
  if (!integration?.monitoring) {
    return { ok: false, error: `${monitor.integrationId} no longer supports monitoring` }
  }

  const action = getAction(monitor.integrationId, integration.monitoring.snapshotAction)
  if (!action) {
    return { ok: false, error: 'monitoring action unavailable' }
  }

  try {
    const connection = await resolveConnection(db, monitor.connectionId, ownerId)
    const client = connection ? await acquireClient(connection, signal) : null
    // thread the monitor id in for integrations (e.g. ping) whose snapshot
    // reads their own retained samples; others ignore the extra key.
    const input = { ...monitor.targetConfig, _monitorId: monitor.id }
    const snapshot = await action.run({ connection, input, log: () => {}, signal, client })
    return { ok: true, ...snapshot }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
