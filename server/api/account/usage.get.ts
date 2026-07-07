import { countActiveApiKeys, countProjectsForOwner } from '../../utils/parse'
import { requireUser } from '../../utils/auth'
import { planFor } from '../../utils/plans'
import { usageSummary } from '../../utils/usage'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const plan = planFor(user.plan)

  const projects = await countProjectsForOwner(user.id)
  const keys = await countActiveApiKeys(user.id)
  const ai = await usageSummary(user.id, user.plan)

  return {
    plan: { id: plan.id, name: plan.name, status: user.planStatus },
    ai,
    projects: { used: Number(projects), limit: plan.limits.projects },
    apiKeys: { used: Number(keys), limit: plan.limits.apiKeys }
  }
})
