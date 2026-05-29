import { getDb } from '../../../db'
import { resolveConnection } from '../../../engine/connections'
import { discoverDokployMonitoring } from '../../../integrations/dokploy-monitoring'
import { requireUser } from '../../../utils/auth'

/**
 * Auto-discovery for the "Add monitor" form (Dokploy path). Given a Dokploy
 * connection, returns the monitoring token + URL (from user.getMetricsToken)
 * plus the list of servers (from server.all) so the user can pick one. The UI
 * uses this to pre-fill the monitoring URL + token, so the common case is just
 * "name + pick server".
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const conn = await resolveConnection(db, id, user.id)
  if (!conn || conn.integrationId !== 'dokploy') {
    throw createError({ statusCode: 400, statusMessage: 'not a Dokploy connection' })
  }

  const signal = (event.node.req as unknown as { signal?: AbortSignal }).signal ?? new AbortController().signal
  const info = await discoverDokployMonitoring(conn, signal)

  // The host is the target with an empty serverId; remote servers are the rest.
  // Keep the legacy response shape the Add-monitor form already consumes.
  const servers = info.targets.filter(t => t.serverId !== '')
  return {
    monitoringEnabled: info.monitoringEnabled,
    metricsToken: info.metricsToken,
    defaultMetricsUrl: info.defaultMetricsUrl,
    servers,
    suggestion: {
      metricsUrl: info.defaultMetricsUrl,
      metricsToken: info.metricsToken
    }
  }
})
