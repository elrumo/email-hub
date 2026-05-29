import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { shortcuts, widgets } from '../../db/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const rows = await db.select().from(shortcuts).where(and(eq(shortcuts.id, id), eq(shortcuts.ownerId, user.id)))
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'shortcut not found' })

  await db.delete(shortcuts).where(and(eq(shortcuts.id, id), eq(shortcuts.ownerId, user.id)))
  // drop this user's home-page widgets that referenced this shortcut
  await db
    .delete(widgets)
    .where(and(eq(widgets.kind, 'shortcut'), eq(widgets.refId, id), eq(widgets.ownerId, user.id)))
  return { id, deleted: true }
})
