import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { widgets } from '../../db/schema'
import { requireUser } from '../../utils/auth'
import { normalizeWidgetBody } from './_shared'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const db = getDb()
  const rows = await db.select().from(widgets).where(and(eq(widgets.id, id), eq(widgets.ownerId, user.id)))
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'widget not found' })

  const fields = normalizeWidgetBody(body, existing)
  await db
    .update(widgets)
    .set({ ...fields, updatedAt: Date.now() })
    .where(and(eq(widgets.id, id), eq(widgets.ownerId, user.id)))

  return { id }
})
