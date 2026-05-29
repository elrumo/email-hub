import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { widgets } from '../../db/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const rows = await db.select().from(widgets).where(and(eq(widgets.id, id), eq(widgets.ownerId, user.id)))
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'widget not found' })
  await db.delete(widgets).where(and(eq(widgets.id, id), eq(widgets.ownerId, user.id)))
  return { id, deleted: true }
})
