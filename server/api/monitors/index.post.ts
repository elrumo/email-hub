import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections, monitors } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { validateAgainstSchema } from '../../engine/validate'
import { registerAllIntegrations } from '../../integrations'

/**
 * Create a monitor. Body: { connectionId, name, targetConfig }.
 * The connection's integration must declare a `monitoring` capability; the
 * targetConfig is validated against that integration's monitoring.targetSchema.
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const body = await readBody(event)
  const connectionId = String(body?.connectionId ?? '')
  const name = String(body?.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const db = getDb()
  const conn = (await db.select().from(connections).where(eq(connections.id, connectionId)))[0]
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
    connectionId,
    integrationId: conn.integrationId,
    name,
    targetConfig: validated.value,
    createdAt: now,
    updatedAt: now
  })

  setResponseStatus(event, 201)
  return { id, name }
})
