import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { boards, connections } from '../../db/schema'
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
  // Detach this connection from any board using it as its analytics provider
  // first — the boards FK is NO ACTION, so deleting while referenced would fail.
  await db
    .update(boards)
    .set({ analyticsConnectionId: null, updatedAt: Date.now() })
    .where(and(eq(boards.analyticsConnectionId, id), eq(boards.ownerId, user.id)))
  // machines/monitors cascade-delete via FK
  await db.delete(connections).where(and(eq(connections.id, id), eq(connections.ownerId, user.id)))
  // close any pooled client (Mongo/SQL/etc.) for this connection
  await releaseClient(id)
  await logActivity(user.id, 'connection.delete', { entityType: 'connection', entityId: id })
  return { id, deleted: true }
})
