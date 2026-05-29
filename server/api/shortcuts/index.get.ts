import { asc, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { shortcuts } from '../../db/schema'
import { requireUser } from '../../utils/auth'

/** List the current user's shortcuts, ordered for display. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = getDb()
  const rows = await db
    .select()
    .from(shortcuts)
    .where(eq(shortcuts.ownerId, user.id))
    .orderBy(asc(shortcuts.sortOrder), asc(shortcuts.createdAt))
  return rows
})
