import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections, monitors } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { validateAgainstSchema } from '../../engine/validate'
import { registerAllIntegrations } from '../../integrations'
import { logActivity, requireUser } from '../../utils/auth'

/**
 * Create a monitor. Body: { connectionId, name, targetConfig }.
 * The connection's integration must declare a `monitoring` capability; the
 * targetConfig is validated against that integration's monitoring.targetSchema.
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
  const body = await readBody(event)
  const connectionId = String(body?.connectionId ?? '')
  const name = String(body?.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const db = getDb()
  const conn = (await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.ownerId, user.id))))[0]
  if (!conn) throw createError({ statusCode: 400, statusMessage: 'unknown connection' })

  const integration = getIntegration(conn.integrationId)
  if (!integration?.monitoring) {
    throw createError({ statusCode: 400, statusMessage: `${conn.integrationId} connections can't be monitored` })
  }

  const validated = validateAgainstSchema(body?.targetConfig ?? {}, integration.monitoring.targetSchema)
  if (!validated.ok) throw createError({ statusCode: 400, statusMessage: validated.error })

  const now = Date.now()
  const id = randomUUID()
  await db.insert(monitors).values({
    id,
    ownerId: user.id,
    connectionId,
    integrationId: conn.integrationId,
    name,
    targetConfig: validated.value,
    createdAt: now,
    updatedAt: now
  })

  await logActivity(user.id, 'monitor.create', { entityType: 'monitor', entityId: id, detail: { name } })
  setResponseStatus(event, 201)
  return { id, name }
})
