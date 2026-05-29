import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { widgets } from '../../db/schema'
import { normalizeWidgetBody } from './_shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const db = getDb()
  const rows = await db.select().from(widgets).where(eq(widgets.id, id))
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'widget not found' })

  const fields = normalizeWidgetBody(body, existing)
  await db
    .update(widgets)
    .set({ ...fields, updatedAt: Date.now() })
    .where(eq(widgets.id, id))

  return { id }
})
