import { listProjects } from '../../utils/parse'
import { requireUser } from '../../utils/auth'
import { projectSummary } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await listProjects(user.id)
  return { projects: rows.map(projectSummary) }
})
