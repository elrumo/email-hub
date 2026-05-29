import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { flowRuns } from '../../../db/schema'

/** Recent run history for a flow (most recent first, capped). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const limit = Math.min(Number(getQuery(event).limit ?? 25) || 25, 100)
  const db = getDb()
  const rows = await db
    .select()
    .from(flowRuns)
    .where(eq(flowRuns.flowId, id))
    .orderBy(desc(flowRuns.startedAt))
    .limit(limit)
  return rows
})
