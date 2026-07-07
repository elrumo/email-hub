import { listEmailsInContainer, listFolders } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { projectSummary, requireOwnedContainer } from '../../../utils/projects'

/** One project with its full folder tree and every email it contains. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const container = await requireOwnedContainer(id, user.id)

  const [folders, emails] = await Promise.all([
    listFolders(container.id),
    listEmailsInContainer(container.id)
  ])

  return {
    project: { id: container.id, name: container.name, updatedAt: container.updatedAt, createdAt: container.createdAt },
    folders: folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId ?? null })),
    emails: emails.map(projectSummary)
  }
})
