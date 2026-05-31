import { getDb } from '../../../db'
import { resolveConnection } from '../../../engine/connections'
import { discoverHomeAssistant } from '../../../integrations/homeassistant'
import { requireUser } from '../../../utils/auth'

/**
 * Auto-discovery for the flow builder (Home Assistant path). Given a Home
 * Assistant connection, reads the live instance and returns every entity (with
 * friendly name + domain) and every service domain → service. The builder uses
 * this to turn the Entity ID / Domain / Service text fields into pickers so the
 * user chooses from what their HA actually exposes instead of typing IDs.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const conn = await resolveConnection(db, id, user.id)
  if (!conn || conn.integrationId !== 'homeassistant') {
    throw createError({ statusCode: 400, statusMessage: 'not a Home Assistant connection' })
  }

  if (!String(conn.config.baseUrl ?? '').trim() || !String(conn.config.token ?? '')) {
    throw createError({ statusCode: 400, statusMessage: 'connection is missing baseUrl/token' })
  }

  const signal = (event.node.req as unknown as { signal?: AbortSignal }).signal ?? new AbortController().signal
  try {
    return await discoverHomeAssistant(conn.config, signal)
  } catch (e) {
    throw createError({
      statusCode: 502,
      statusMessage: e instanceof Error ? e.message : 'Could not reach Home Assistant'
    })
  }
})
