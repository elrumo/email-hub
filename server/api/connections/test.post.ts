import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { mergeSecrets } from '../../engine/validate'
import { registerAllIntegrations } from '../../integrations'
import { requireUser } from '../../utils/auth'

/**
 * Test a connection's credentials without saving. Body:
 *   { integrationId, config, connectionId? }
 * If `connectionId` is given, any redacted/blank secrets in `config` are
 * back-filled from the saved connection (so "Test" works when editing without
 * retyping the secret). Returns { ok, message }.
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
  const body = await readBody(event)
  const integrationId = String(body?.integrationId ?? '')
  const integration = getIntegration(integrationId)
  if (!integration) throw createError({ statusCode: 400, statusMessage: `unknown integration: ${integrationId}` })
  if (!integration.testConnection) {
    return { ok: false, message: `${integration.name} can't be tested` }
  }

  let config: Record<string, unknown> = (body?.config && typeof body.config === 'object') ? body.config : {}

  if (body?.connectionId) {
    const db = getDb()
    const existing = (await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, String(body.connectionId)), eq(connections.ownerId, user.id))))[0]
    if (existing) config = mergeSecrets(config, existing.config, integration.connectionSchema)
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 10_000)
  try {
    return await integration.testConnection(config, ac.signal)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Test failed' }
  } finally {
    clearTimeout(timer)
  }
})
