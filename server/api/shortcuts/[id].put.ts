import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { shortcuts } from '../../db/schema'
import { normalizeShortcutBody } from './_shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const db = getDb()
  const rows = await db.select().from(shortcuts).where(eq(shortcuts.id, id))
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'shortcut not found' })

  const fields = normalizeShortcutBody(body, existing)
  await db
    .update(shortcuts)
    .set({ ...fields, updatedAt: Date.now() })
    .where(eq(shortcuts.id, id))

  return { id }
})
