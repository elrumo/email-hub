import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../../../../db'
import { boards, monitors, widgets } from '../../../../../../db/schema'
import { registerAllIntegrations } from '../../../../../../integrations'
import { snapshotMonitor } from '../../../../../monitors/_snapshot'

/**
 * Public, unauthenticated live snapshot for one monitor tile on a public board.
 * The monitor must both appear on that board and be opted into public display.
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const slug = getRouterParam(event, 'slug')!
  const monitorId = getRouterParam(event, 'monitorId')!
  const db = getDb()

  const board = (await db.select().from(boards).where(eq(boards.slug, slug)))[0]
  if (!board || !board.isPublic || !board.ownerId) {
    throw createError({ statusCode: 404, statusMessage: 'board not found' })
  }

  const tile = (await db
    .select({ id: widgets.id })
    .from(widgets)
    .where(and(eq(widgets.boardId, board.id), eq(widgets.kind, 'monitor'), eq(widgets.refId, monitorId))))[0]
  if (!tile) {
    throw createError({ statusCode: 404, statusMessage: 'monitor not found' })
  }

  const monitor = (await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, monitorId), eq(monitors.ownerId, board.ownerId))))[0]
  if (!monitor || !monitor.publicVisible) {
    throw createError({ statusCode: 404, statusMessage: 'monitor not found' })
  }

  const signal = (event.node.req as unknown as { signal?: AbortSignal }).signal ?? new AbortController().signal
  return snapshotMonitor(db, monitor, board.ownerId, signal)
})
