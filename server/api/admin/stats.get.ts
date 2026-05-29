import { count } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections, flowRuns, flows, monitors, users } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'

/** Admin overview totals across the whole instance. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = getDb()
  const [u, f, c, m, r] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(flows),
    db.select({ n: count() }).from(connections),
    db.select({ n: count() }).from(monitors),
    db.select({ n: count() }).from(flowRuns)
  ])
  return {
    users: u[0]?.n ?? 0,
    flows: f[0]?.n ?? 0,
    connections: c[0]?.n ?? 0,
    monitors: m[0]?.n ?? 0,
    flowRuns: r[0]?.n ?? 0
  }
})
