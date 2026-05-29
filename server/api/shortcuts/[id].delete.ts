import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { shortcuts, widgets } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const rows = await db.select().from(shortcuts).where(eq(shortcuts.id, id))
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'shortcut not found' })

  await db.delete(shortcuts).where(eq(shortcuts.id, id))
  // drop any home-page widgets that referenced this shortcut
  await db.delete(widgets).where(and(eq(widgets.kind, 'shortcut'), eq(widgets.refId, id)))
  return { id, deleted: true }
})
