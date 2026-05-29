import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { boards } from '../../db/schema'
import { logActivity, requireUser } from '../../utils/auth'
import { clearOtherDefaults, resolveAnalyticsConnectionId, uniqueSlug } from './_shared'

/** Update a board (rename, slug, default/public/publicTrigger flags). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const db = getDb()
  const rows = await db.select().from(boards).where(and(eq(boards.id, id), eq(boards.ownerId, user.id)))
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'board not found' })

  const update: Record<string, unknown> = { updatedAt: Date.now() }

  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
    update.name = name
  }
  if (body?.slug !== undefined) {
    update.slug = await uniqueSlug(db, String(body.slug || existing.name), id)
  }
  if (body?.isPublic !== undefined) update.isPublic = !!body.isPublic
  if (body?.publicTrigger !== undefined) update.publicTrigger = !!body.publicTrigger
  if (body?.analyticsConnectionId !== undefined) {
    update.analyticsConnectionId = await resolveAnalyticsConnectionId(db, user.id, body.analyticsConnectionId)
  }

  // A user always has exactly one default; you can promote a board but not
  // un-default it directly (promote another instead).
  let makeDefault = false
  if (body?.isDefault === true && !existing.isDefault) {
    update.isDefault = true
    makeDefault = true
  }

  await db.update(boards).set(update).where(and(eq(boards.id, id), eq(boards.ownerId, user.id)))
  if (makeDefault) await clearOtherDefaults(db, user.id, id)

  await logActivity(user.id, 'board.update', { entityType: 'board', entityId: id })
  return { id, updated: true }
})
