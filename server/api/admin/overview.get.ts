import { requireAdmin } from '../../utils/auth'
import { listAiUsageSince, listAllUsers, listProjectOwnerIds } from '../../utils/parse'
import { planFor } from '../../utils/plans'
import { startOfMonth } from '../../utils/usage'

/**
 * Everything the admin dashboard needs in one round trip: aggregate stats
 * plus a per-user breakdown of plan, projects and AI usage this month.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [users, projectOwners, usageRows] = await Promise.all([
    listAllUsers(),
    listProjectOwnerIds(),
    listAiUsageSince(startOfMonth())
  ])

  const projectsByOwner = new Map<string, number>()
  for (const ownerId of projectOwners) {
    projectsByOwner.set(ownerId, (projectsByOwner.get(ownerId) ?? 0) + 1)
  }

  const usageByUser = new Map<string, { messages: number, tokens: number }>()
  for (const row of usageRows) {
    const entry = usageByUser.get(row.userId) ?? { messages: 0, tokens: 0 }
    entry.messages += 1
    entry.tokens += row.totalTokens
    usageByUser.set(row.userId, entry)
  }

  const planCounts: Record<string, number> = {}
  for (const u of users) {
    const plan = planFor(u.plan).id
    planCounts[plan] = (planCounts[plan] ?? 0) + 1
  }

  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  return {
    stats: {
      users: users.length,
      activeLast30d: users.filter(u => (u.lastLoginAt ?? 0) >= monthAgo).length,
      projects: projectOwners.length,
      aiMessagesThisMonth: usageRows.length,
      aiTokensThisMonth: usageRows.reduce((sum, r) => sum + r.totalTokens, 0),
      paidSubscriptions: users.filter(u => u.plan !== 'free' && u.planStatus !== 'canceled').length,
      planCounts
    },
    users: users.map((u) => {
      const usage = usageByUser.get(u.id) ?? { messages: 0, tokens: 0 }
      const plan = planFor(u.plan)
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        plan: plan.id,
        planStatus: u.planStatus,
        projects: projectsByOwner.get(u.id) ?? 0,
        projectLimit: plan.limits.projects,
        aiMessagesThisMonth: usage.messages,
        aiMessageLimit: plan.limits.aiMessagesPerMonth,
        aiTokensThisMonth: usage.tokens,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt
      }
    })
  }
})
