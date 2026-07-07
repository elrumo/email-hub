import { listChatMessages } from '../../../utils/parse'
import { requireEmailAccess } from '../../../utils/access'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { email: project, level } = await requireEmailAccess(event, id, 'view')

  // The AI chat (and its history) is the owner's — collaborators edit manually.
  const messages = level === 'owner' ? await listChatMessages(id) : []

  return {
    access: level,
    project: {
      id: project.id,
      name: project.name,
      document: project.document,
      variables: project.variables ?? [],
      projectId: level === 'owner' ? project.projectId ?? null : null,
      folderId: level === 'owner' ? project.folderId ?? null : null,
      shareMode: level === 'owner' ? project.shareMode ?? null : null,
      shareToken: level === 'owner' ? project.shareToken ?? null : null,
      updatedAt: project.updatedAt
    },
    messages: messages.map(m => ({ id: m.id, role: m.role, parts: m.parts }))
  }
})
