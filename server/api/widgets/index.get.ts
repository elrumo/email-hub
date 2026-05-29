import { asc } from 'drizzle-orm'
import { getDb } from '../../db'
import { widgets } from '../../db/schema'

/** List home-page widgets, ordered for the bento grid. */
export default defineEventHandler(async () => {
  const db = getDb()
  const rows = await db.select().from(widgets).orderBy(asc(widgets.sortOrder), asc(widgets.createdAt))
  return rows
})
