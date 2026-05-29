import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { monitors } from '../../db/schema'
import { logActivity, requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  if (!(await db.select().from(monitors).where(and(eq(monitors.id, id), eq(monitors.ownerId, user.id))))[0]) {
    throw createError({ statusCode: 404, statusMessage: 'monitor not found' })
  }
  await db.delete(monitors).where(and(eq(monitors.id, id), eq(monitors.ownerId, user.id)))
  await logActivity(user.id, 'monitor.delete', { entityType: 'monitor', entityId: id })
  return { id, deleted: true }
})
