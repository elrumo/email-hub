import { count, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { apiKeys, emailProjects } from '../../db/schema'
import { requireUser } from '../../utils/auth'
import { planFor } from '../../utils/plans'
import { usageSummary } from '../../utils/usage'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = getDb()
  const plan = planFor(user.plan)

  const projectRows = await db.select({ projects: count() }).from(emailProjects).where(eq(emailProjects.ownerId, user.id))
  const keyRows = await db.select({ keys: count() }).from(apiKeys).where(eq(apiKeys.ownerId, user.id))
  const projects = projectRows[0]?.projects ?? 0
  const keys = keyRows[0]?.keys ?? 0
  const ai = await usageSummary(user.id, user.plan)

  return {
    plan: { id: plan.id, name: plan.name, status: user.planStatus },
    ai,
    projects: { used: Number(projects), limit: plan.limits.projects },
    apiKeys: { used: Number(keys), limit: plan.limits.apiKeys }
  }
})
