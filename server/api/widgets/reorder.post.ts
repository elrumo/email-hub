import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { widgets } from '../../db/schema'

/**
 * Persist a new ordering for the bento grid in one call. Body: { ids: string[] }
 * in the desired display order; each id's sortOrder is set to its index.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : null
  if (!ids) throw createError({ statusCode: 400, statusMessage: 'ids must be an array' })

  const db = getDb()
  const now = Date.now()
  for (let i = 0; i < ids.length; i++) {
    await db.update(widgets).set({ sortOrder: i, updatedAt: now }).where(eq(widgets.id, ids[i]))
  }
  return { ok: true }
})
