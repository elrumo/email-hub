import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { apiKeys } from '../../db/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const rows = await db.select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.ownerId, user.id)))
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'API key not found' })

  await db.update(apiKeys).set({ revokedAt: Date.now() }).where(eq(apiKeys.id, id))
  return { ok: true }
})
