import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { mergeSecrets, validateAgainstSchema } from '../../engine/validate'
import { registerAllIntegrations } from '../../integrations'
import { logActivity, requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const db = getDb()
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.ownerId, user.id)))
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'connection not found' })

  const integration = getIntegration(existing.integrationId)
  if (!integration) throw createError({ statusCode: 400, statusMessage: 'unknown integration' })

  const name = body?.name !== undefined ? String(body.name).trim() : existing.name
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  // merge redacted secrets with existing values before validating
  const merged = mergeSecrets(body?.config ?? {}, existing.config, integration.connectionSchema)
  const validated = validateAgainstSchema(merged, integration.connectionSchema)
  if (!validated.ok) throw createError({ statusCode: 400, statusMessage: validated.error })

  await db
    .update(connections)
    .set({ name, config: validated.value, updatedAt: Date.now() })
    .where(and(eq(connections.id, id), eq(connections.ownerId, user.id)))

  await logActivity(user.id, 'connection.update', { entityType: 'connection', entityId: id, detail: { name } })
  return { id, integrationId: existing.integrationId, name }
})
