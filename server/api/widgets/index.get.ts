import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { widgets } from '../../db/schema'
import { requireUser } from '../../utils/auth'
import { resolveOwnedBoard } from './_shared'

/**
 * List the current user's home-page widgets for one board, ordered for the
 * bento grid. `?boardId=` selects the board; omitted means the default board.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = getDb()
  const boardId = await resolveOwnedBoard(db, user.id, String(getQuery(event).boardId ?? '') || null)
  const rows = await db
    .select()
    .from(widgets)
    .where(and(eq(widgets.ownerId, user.id), eq(widgets.boardId, boardId)))
    .orderBy(asc(widgets.sortOrder), asc(widgets.createdAt))
  return rows
})
