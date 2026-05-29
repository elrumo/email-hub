import { getDb } from '../../../db'
import { resolveConnection } from '../../../engine/connections'
import { discoverKumaMonitors } from '../../../integrations/kuma'
import { requireUser } from '../../../utils/auth'

/**
 * Auto-discovery for the "Add monitor" form (Uptime Kuma path). Given a Kuma
 * connection, reads /metrics and returns every monitor Kuma reports, each with
 * its group (when available). The UI uses this to populate a multi-select so
 * the user can add many monitors at once instead of typing names by hand.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const conn = await resolveConnection(db, id, user.id)
  if (!conn || conn.integrationId !== 'kuma') {
    throw createError({ statusCode: 400, statusMessage: 'not an Uptime Kuma connection' })
  }

  const baseUrl = String(conn.config.baseUrl ?? '')
  const apiKey = String(conn.config.apiKey ?? '')
  if (!baseUrl || !apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'connection is missing baseUrl/apiKey' })
  }

  const signal = (event.node.req as unknown as { signal?: AbortSignal }).signal ?? new AbortController().signal
  const monitors = await discoverKumaMonitors(baseUrl, apiKey, signal)
  return { monitors }
})
