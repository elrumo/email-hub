import { listChatMessages } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedProject } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const project = await requireOwnedProject(id, user.id)
  const messages = await listChatMessages(id)

  return {
    project: {
      id: project.id,
      name: project.name,
      document: project.document,
      variables: project.variables ?? [],
      updatedAt: project.updatedAt
    },
    messages: messages.map(m => ({ id: m.id, role: m.role, parts: m.parts }))
  }
})
