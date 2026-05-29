import { and, asc, eq, ne } from 'drizzle-orm'
import { getDb } from '../../db'
import { boards } from '../../db/schema'
import { logActivity, requireUser } from '../../utils/auth'

/**
 * Delete a board (cascades its widgets). A user can't delete their last board.
 * If the deleted board was the default, the next board becomes the default.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!

  const db = getDb()
  const rows = await db.select().from(boards).where(and(eq(boards.id, id), eq(boards.ownerId, user.id)))
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'board not found' })

  const others = await db
    .select()
    .from(boards)
    .where(and(eq(boards.ownerId, user.id), ne(boards.id, id)))
    .orderBy(asc(boards.sortOrder), asc(boards.createdAt))
  if (others.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'cannot delete your only board' })
  }

  await db.delete(boards).where(and(eq(boards.id, id), eq(boards.ownerId, user.id)))

  // ensure a default survives
  if (existing.isDefault) {
    await db.update(boards).set({ isDefault: true, updatedAt: Date.now() }).where(eq(boards.id, others[0]!.id))
  }

  await logActivity(user.id, 'board.delete', { entityType: 'board', entityId: id })
  return { id, deleted: true }
})
