import { requireApiUser } from '../../../../utils/apiKey'
import { projectSummary, requireOwnedProject } from '../../../../utils/projects'

/** Public API: fetch a single project's metadata + declared variables. */
export default defineEventHandler(async (event) => {
  const user = await requireApiUser(event)
  const id = getRouterParam(event, 'id')!
  const project = await requireOwnedProject(id, user.id)
  return projectSummary(project)
})
