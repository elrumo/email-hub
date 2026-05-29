import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { boards } from '../../db/schema'
import { logActivity, requireUser } from '../../utils/auth'
import { clearOtherDefaults, normalizeAnalyticsDomain, normalizeBoardIcon, resolveAnalyticsConnectionId, uniqueSlug } from './_shared'

/** Create a board for the current user. The first board becomes the default. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  const name = String(body?.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const db = getDb()
  const existing = await db.select({ id: boards.id }).from(boards).where(eq(boards.ownerId, user.id))
  const isDefault = existing.length === 0 ? true : !!body?.isDefault

  const now = Date.now()
  const id = randomUUID()
  const slug = await uniqueSlug(db, body?.slug ? String(body.slug) : name)
  const analyticsConnectionId = await resolveAnalyticsConnectionId(db, user.id, body?.analyticsConnectionId)
  // The site domain only means anything alongside a tracking connection.
  const analyticsDomain = analyticsConnectionId ? normalizeAnalyticsDomain(body?.analyticsDomain) : null
  await db.insert(boards).values({
    id,
    ownerId: user.id,
    name,
    slug,
    icon: normalizeBoardIcon(body?.icon),
    isDefault,
    isPublic: !!body?.isPublic,
    publicTrigger: !!body?.publicTrigger,
    analyticsConnectionId,
    analyticsDomain,
    sortOrder: existing.length,
    createdAt: now,
    updatedAt: now
  })
  if (isDefault) await clearOtherDefaults(db, user.id, id)

  await logActivity(user.id, 'board.create', { entityType: 'board', entityId: id, detail: { name } })
  setResponseStatus(event, 201)
  return { id, slug }
})
