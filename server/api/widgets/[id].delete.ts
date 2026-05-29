import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { widgets } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const rows = await db.select().from(widgets).where(eq(widgets.id, id))
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'widget not found' })
  await db.delete(widgets).where(eq(widgets.id, id))
  return { id, deleted: true }
})
