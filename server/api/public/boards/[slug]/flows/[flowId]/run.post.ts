import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../../../../db'
import { boards, flows, widgets } from '../../../../../../db/schema'
import { executeFlow } from '../../../../../../engine/service'
import { registerAllIntegrations } from '../../../../../../integrations'
import { rateLimit } from '../../../../../../utils/rateLimit'

/**
 * Public, unauthenticated trigger of a flow that lives on a public board. The
 * engine is session-free and resolves the flow owner's connections from
 * `flow.ownerId`, so no session is needed. Gated by, in order:
 *   1. the board exists and is public
 *   2. the flow is actually a tile on that board (can't run arbitrary flows)
 *   3. the flow is enabled
 *   4. board.publicTrigger (overrides) OR flow.publicTrigger
 *   5. a per-flow rate limit (public exposure → blunt abuse)
 *
 * The request body is exposed to the flow as {{ trigger.* }}.
 */
const RATE_LIMIT = 6 // runs
const RATE_WINDOW_MS = 60_000 // per minute, per flow

export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const slug = getRouterParam(event, 'slug')!
  const flowId = getRouterParam(event, 'flowId')!
  const db = getDb()

  const board = (await db.select().from(boards).where(eq(boards.slug, slug)))[0]
  if (!board || !board.isPublic) {
    throw createError({ statusCode: 404, statusMessage: 'board not found' })
  }

  // the flow must be a tile on THIS board (and owned by the board owner)
  const onBoard = (await db
    .select({ id: widgets.id })
    .from(widgets)
    .where(and(eq(widgets.boardId, board.id), eq(widgets.kind, 'flow'), eq(widgets.refId, flowId))))[0]
  if (!onBoard) throw createError({ statusCode: 404, statusMessage: 'flow not found on this board' })

  const flow = (await db
    .select()
    .from(flows)
    .where(and(eq(flows.id, flowId), eq(flows.ownerId, board.ownerId!))))[0]
  if (!flow) throw createError({ statusCode: 404, statusMessage: 'flow not found' })
  if (!flow.enabled) throw createError({ statusCode: 403, statusMessage: 'flow is disabled' })

  // board flag overrides the per-flow flag, per product spec
  if (!(board.publicTrigger || flow.publicTrigger)) {
    throw createError({ statusCode: 403, statusMessage: 'this flow is not publicly triggerable' })
  }

  if (!rateLimit(`public-run:${flowId}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    throw createError({ statusCode: 429, statusMessage: 'too many runs, try again shortly' })
  }

  const body = await readBody(event).catch(() => ({}))
  const payload = body && typeof body === 'object' ? body : {}
  const result = await executeFlow(flowId, 'webhook', payload as Record<string, unknown>)
  return { status: result.status }
})
