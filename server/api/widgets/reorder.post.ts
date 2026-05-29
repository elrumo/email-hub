import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { widgets } from '../../db/schema'
import { requireUser } from '../../utils/auth'

/**
 * Persist a new ordering for the bento grid in one call. Body: { ids: string[] }
 * in the desired display order; each id's sortOrder is set to its index. Only
 * the current user's widgets are affected.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : null
  if (!ids) throw createError({ statusCode: 400, statusMessage: 'ids must be an array' })

  const db = getDb()
  const now = Date.now()
  for (let i = 0; i < ids.length; i++) {
    await db
      .update(widgets)
      .set({ sortOrder: i, updatedAt: now })
      .where(and(eq(widgets.id, ids[i]), eq(widgets.ownerId, user.id)))
  }
  return { ok: true }
})
