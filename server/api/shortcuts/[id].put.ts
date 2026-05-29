import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { shortcuts } from '../../db/schema'
import { requireUser } from '../../utils/auth'
import { normalizeShortcutBody } from './_shared'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const db = getDb()
  const rows = await db.select().from(shortcuts).where(and(eq(shortcuts.id, id), eq(shortcuts.ownerId, user.id)))
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'shortcut not found' })

  const fields = normalizeShortcutBody(body, existing)
  await db
    .update(shortcuts)
    .set({ ...fields, updatedAt: Date.now() })
    .where(and(eq(shortcuts.id, id), eq(shortcuts.ownerId, user.id)))

  return { id }
})
