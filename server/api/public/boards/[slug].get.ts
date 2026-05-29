import { and, asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../../../db'
import { boards, connections, flows, monitors, shortcuts, widgets } from '../../../db/schema'
import { getIntegration } from '../../../engine/registry'
import type { AnalyticsScriptTag } from '../../../engine/types'
import { registerAllIntegrations } from '../../../integrations'

/**
 * Public, unauthenticated read of a board by slug. Returns the board plus its
 * widgets and only the DISPLAY fields of the referenced entities — never
 * connection ids/configs or webhook secrets. Monitor tiles carry a
 * `publicVisible` flag; live monitor data is fetched separately and only for
 * monitors that opt into public display.
 *
 * 404 unless the board exists and `isPublic` is true.
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const slug = getRouterParam(event, 'slug')!
  const db = getDb()

  const board = (await db.select().from(boards).where(eq(boards.slug, slug)))[0]
  if (!board || !board.isPublic) {
    throw createError({ statusCode: 404, statusMessage: 'board not found' })
  }

  // Resolve the board's analytics provider (if any) into public-safe script
  // tags. Only the integration's webAnalytics output leaves the server — never
  // the connection config (which may hold an API key / service account).
  let analyticsTags: AnalyticsScriptTag[] = []
  if (board.analyticsConnectionId && board.ownerId) {
    const conn = (await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, board.analyticsConnectionId), eq(connections.ownerId, board.ownerId))))[0]
    const integration = conn ? getIntegration(conn.integrationId) : undefined
    if (conn && integration?.webAnalytics) {
      try {
        analyticsTags = integration.webAnalytics.scriptTags(conn.config, { domain: board.analyticsDomain ?? undefined })
      } catch {
        analyticsTags = []
      }
    }
  }

  const tiles = await db
    .select()
    .from(widgets)
    .where(eq(widgets.boardId, board.id))
    .orderBy(asc(widgets.sortOrder), asc(widgets.createdAt))

  const idsOf = (kind: string) =>
    tiles.filter(t => t.kind === kind && t.refId).map(t => t.refId as string)

  const shortcutIds = idsOf('shortcut')
  const flowIds = idsOf('flow')
  const monitorIds = idsOf('monitor')

  const shortcutRows = shortcutIds.length
    ? await db.select().from(shortcuts).where(and(eq(shortcuts.ownerId, board.ownerId!), inArray(shortcuts.id, shortcutIds)))
    : []
  const flowRows = flowIds.length
    ? await db.select().from(flows).where(and(eq(flows.ownerId, board.ownerId!), inArray(flows.id, flowIds)))
    : []
  const monitorRows = monitorIds.length
    ? await db.select().from(monitors).where(and(eq(monitors.ownerId, board.ownerId!), inArray(monitors.id, monitorIds)))
    : []

  return {
    board: {
      id: board.id,
      name: board.name,
      slug: board.slug,
      icon: board.icon,
      publicTrigger: board.publicTrigger
    },
    // public-safe analytics script tags to inject on the board page (may be [])
    analytics: { tags: analyticsTags },
    widgets: tiles.map(t => ({
      id: t.id,
      kind: t.kind,
      refId: t.refId,
      content: t.content,
      cardStyle: t.cardStyle,
      bg: t.bg,
      bgLight: t.bgLight,
      bgDark: t.bgDark,
      w: t.w,
      h: t.h,
      sortOrder: t.sortOrder
    })),
    // display-only projections — no secrets/connections leak out
    shortcuts: shortcutRows.map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      icon: s.icon
    })),
    flows: flowRows.map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      enabled: f.enabled,
      // board flag overrides the per-flow flag, per product spec
      canTrigger: f.enabled && (board.publicTrigger || f.publicTrigger)
    })),
    monitors: monitorRows.map(m => ({
      id: m.id,
      name: m.name,
      integrationId: m.integrationId,
      publicVisible: m.publicVisible
    }))
  }
})
