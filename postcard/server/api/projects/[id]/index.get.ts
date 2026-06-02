import { asc, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { emailChatMessages } from '../../../db/schema'
import { requireUser } from '../../../utils/auth'
import { requireOwnedProject } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const project = await requireOwnedProject(id, user.id)

  const messages = await getDb()
    .select()
    .from(emailChatMessages)
    .where(eq(emailChatMessages.projectId, id))
    .orderBy(asc(emailChatMessages.createdAt))

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
