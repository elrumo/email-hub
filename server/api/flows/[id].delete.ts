import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { flows } from '../../db/schema'
import { logActivity, requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const rows = await db.select().from(flows).where(and(eq(flows.id, id), eq(flows.ownerId, user.id)))
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'flow not found' })
  // flow_runs and flow_state cascade-delete via FK
  await db.delete(flows).where(and(eq(flows.id, id), eq(flows.ownerId, user.id)))
  await logActivity(user.id, 'flow.delete', { entityType: 'flow', entityId: id })
  return { id, deleted: true }
})
