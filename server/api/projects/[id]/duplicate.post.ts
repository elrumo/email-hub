import { countProjectsForOwner, createProject } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { planFor } from '../../../utils/plans'
import { projectSummary, requireOwnedProject } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const source = await requireOwnedProject(id, user.id)

  const n = await countProjectsForOwner(user.id)
  const limit = planFor(user.plan).limits.projects
  if (n >= limit) {
    throw createError({ statusCode: 402, statusMessage: `You've reached your plan's limit of ${limit} projects.` })
  }

  const now = Date.now()
  const row = await createProject({
    ownerId: user.id,
    name: `${source.name} copy`,
    document: source.document,
    variables: source.variables,
    createdAt: now,
    updatedAt: now
  })

  return { project: projectSummary(row) }
})
