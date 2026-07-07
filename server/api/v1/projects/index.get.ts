import { listProjects } from '../../../utils/parse'
import { requireApiUser } from '../../../utils/apiKey'
import { projectSummary } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireApiUser(event)
  const rows = await listProjects(user.id)
  return rows.map(projectSummary)
})
