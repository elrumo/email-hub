import { asc } from 'drizzle-orm'
import { getDb } from '../../db'
import { shortcuts } from '../../db/schema'

/** List shortcuts, ordered for display. */
export default defineEventHandler(async () => {
  const db = getDb()
  const rows = await db.select().from(shortcuts).orderBy(asc(shortcuts.sortOrder), asc(shortcuts.createdAt))
  return rows
})
