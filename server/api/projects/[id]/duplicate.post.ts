import { randomUUID } from 'node:crypto'
import { count, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { emailProjects } from '../../../db/schema'
import { requireUser } from '../../../utils/auth'
import { planFor } from '../../../utils/plans'
import { projectSummary, requireOwnedProject } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const source = await requireOwnedProject(id, user.id)

  const db = getDb()
  const countRows = await db.select({ n: count() }).from(emailProjects).where(eq(emailProjects.ownerId, user.id))
  const n = countRows[0]?.n ?? 0
  const limit = planFor(user.plan).limits.projects
  if (n >= limit) {
    throw createError({ statusCode: 402, statusMessage: `You've reached your plan's limit of ${limit} projects.` })
  }

  const now = Date.now()
  const [row] = await db.insert(emailProjects).values({
    id: randomUUID(),
    ownerId: user.id,
    name: `${source.name} copy`,
    document: source.document,
    variables: source.variables,
    createdAt: now,
    updatedAt: now
  }).returning()

  return { project: projectSummary(row!) }
})
