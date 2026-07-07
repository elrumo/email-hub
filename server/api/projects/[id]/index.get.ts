import { getContainer, listEmailsInContainer, listFolders } from '../../../utils/parse'
import { getSessionUser } from '../../../utils/auth'
import { projectSummary } from '../../../utils/projects'

/** One project with its full folder tree and every email it contains. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const container = await getContainer(id)
  const user = await getSessionUser(event)

  const isOwner = !!user && !!container && container.ownerId === user.id
  const isMember = !!user && !!container && (container.memberIds ?? []).includes(user.id)
  if (!container || (!isOwner && !isMember)) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const [folders, emails] = await Promise.all([
    listFolders(container.id),
    listEmailsInContainer(container.id)
  ])

  return {
    access: isOwner ? 'owner' as const : 'member' as const,
    project: { id: container.id, name: container.name, updatedAt: container.updatedAt, createdAt: container.createdAt },
    folders: folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId ?? null })),
    emails: emails.map(projectSummary)
  }
})
