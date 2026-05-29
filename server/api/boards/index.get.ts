import { asc, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { boards } from '../../db/schema'
import { requireUser } from '../../utils/auth'

/** List the current user's boards, ordered for the board switcher. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = getDb()
  return await db
    .select()
    .from(boards)
    .where(eq(boards.ownerId, user.id))
    .orderBy(asc(boards.sortOrder), asc(boards.createdAt))
})
