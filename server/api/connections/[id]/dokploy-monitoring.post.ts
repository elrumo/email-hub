import { getDb } from '../../../db'
import { resolveConnection } from '../../../engine/connections'
import { discoverDokployMonitoring, enableDokployMonitoring } from '../../../integrations/dokploy-monitoring'
import { requireUser } from '../../../utils/auth'

/**
 * Enable monitoring for a Dokploy target via the API (the "Enable it for me"
 * button on the Add-monitor form). Configures & deploys the monitoring agent
 * with sensible defaults — `admin.setupMonitoring` for the host, or
 * `server.setupMonitoring` for a remote server — then re-runs discovery and
 * returns the same shape the form already consumes, so the URL + token
 * auto-fill without a second round-trip.
 *
 * Body: { serverId?: string } — blank/absent means the Dokploy host itself.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const { serverId = '' } = await readBody<{ serverId?: string }>(event) ?? {}

  const db = getDb()
  const conn = await resolveConnection(db, id, user.id)
  if (!conn || conn.integrationId !== 'dokploy') {
    throw createError({ statusCode: 400, statusMessage: 'not a Dokploy connection' })
  }

  const signal = (event.node.req as unknown as { signal?: AbortSignal }).signal ?? new AbortController().signal

  try {
    await enableDokployMonitoring(conn, String(serverId), signal)
  } catch (e) {
    throw createError({ statusCode: 502, statusMessage: e instanceof Error ? e.message : 'Failed to enable monitoring in Dokploy' })
  }

  // Re-discover so the caller gets the freshly-minted token + URL. Same shape
  // as the GET discovery endpoint.
  const info = await discoverDokployMonitoring(conn, signal)
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
