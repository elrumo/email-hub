import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { flowRuns, flows } from '../../../db/schema'
import { requireUser } from '../../../utils/auth'

/** Recent run history for a flow (most recent first, capped). Owner-gated. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const limit = Math.min(Number(getQuery(event).limit ?? 25) || 25, 100)
  const db = getDb()

  // only the flow's owner may read its run history
  const owned = (await db
    .select({ id: flows.id })
    .from(flows)
    .where(and(eq(flows.id, id), eq(flows.ownerId, user.id))))[0]
  if (!owned) throw createError({ statusCode: 404, statusMessage: 'flow not found' })

  const rows = await db
    .select()
    .from(flowRuns)
    .where(eq(flowRuns.flowId, id))
    .orderBy(desc(flowRuns.startedAt))
    .limit(limit)
  return rows
})
