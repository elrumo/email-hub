import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { monitors } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  if (!(await db.select().from(monitors).where(eq(monitors.id, id)))[0]) {
    throw createError({ statusCode: 404, statusMessage: 'monitor not found' })
  }
  await db.delete(monitors).where(eq(monitors.id, id))
  return { id, deleted: true }
})
