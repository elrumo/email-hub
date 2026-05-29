import { count, eq, max, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { connections, flowRuns, flows, monitors, shortcuts } from '../db/schema'

/** Aggregate stats for one user. Flow-run metrics join runs → flows by owner. */
export interface UserStats {
  flowsCreated: number
  connectionsCount: number
  monitorsCount: number
  shortcutsCount: number
  flowRunsTotal: number
  flowRunSuccess: number
  flowRunError: number
  lastFlowRunAt: number | null
}

/**
 * Compute a user's aggregate stats. Counts owned entities and rolls up the
 * user's flow runs (joined flow_runs → flows on the owner) by status. One
 * function, used by both the per-user account page and the admin overview.
 */
export async function computeUserStats(userId: string): Promise<UserStats> {
  const db = getDb()

  const [flowCount, connCount, monCount, scCount, runAgg] = await Promise.all([
    db.select({ n: count() }).from(flows).where(eq(flows.ownerId, userId)),
    db.select({ n: count() }).from(connections).where(eq(connections.ownerId, userId)),
    db.select({ n: count() }).from(monitors).where(eq(monitors.ownerId, userId)),
    db.select({ n: count() }).from(shortcuts).where(eq(shortcuts.ownerId, userId)),
    db
      .select({
        total: count(),
        success: sql<number>`sum(case when ${flowRuns.status} = 'success' then 1 else 0 end)`,
        error: sql<number>`sum(case when ${flowRuns.status} = 'error' then 1 else 0 end)`,
        lastAt: max(flowRuns.startedAt)
      })
      .from(flowRuns)
      .innerJoin(flows, eq(flowRuns.flowId, flows.id))
      .where(eq(flows.ownerId, userId))
  ])

  const agg = runAgg[0]
  return {
    flowsCreated: flowCount[0]?.n ?? 0,
    connectionsCount: connCount[0]?.n ?? 0,
    monitorsCount: monCount[0]?.n ?? 0,
    shortcutsCount: scCount[0]?.n ?? 0,
    flowRunsTotal: Number(agg?.total ?? 0),
    flowRunSuccess: Number(agg?.success ?? 0),
    flowRunError: Number(agg?.error ?? 0),
    lastFlowRunAt: agg?.lastAt ?? null
  }
}
