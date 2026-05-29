import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections } from '../../db/schema'
import { releaseClient } from '../../engine/clientPool'
import { logActivity, requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.ownerId, user.id)))
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'connection not found' })
  // machines cascade-delete via FK
  await db.delete(connections).where(and(eq(connections.id, id), eq(connections.ownerId, user.id)))
  // close any pooled client (Mongo/SQL/etc.) for this connection
  await releaseClient(id)
  await logActivity(user.id, 'connection.delete', { entityType: 'connection', entityId: id })
  return { id, deleted: true }
})
