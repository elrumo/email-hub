import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { mergeSecrets } from '../../engine/validate'
import { listModels } from '../../integrations/ai'
import { registerAllIntegrations } from '../../integrations'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
  const body = await readBody(event)
  const integration = getIntegration('ai')
  if (!integration) throw createError({ statusCode: 400, statusMessage: 'AI integration is not available' })

  let config: Record<string, unknown> = (body?.config && typeof body.config === 'object') ? body.config : {}

  if (body?.connectionId) {
    const db = getDb()
    const existing = (await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, String(body.connectionId)), eq(connections.ownerId, user.id))))[0]
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'connection not found' })
    if (existing.integrationId !== 'ai') throw createError({ statusCode: 400, statusMessage: 'connection is not an AI provider' })
    config = mergeSecrets(config, existing.config, integration.connectionSchema)
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 10_000)
  try {
    return { models: await listModels(config, ac.signal) }
  } catch (e) {
    throw createError({
      statusCode: 400,
      statusMessage: e instanceof Error ? e.message : 'Could not list models'
    })
  } finally {
    clearTimeout(timer)
  }
})
