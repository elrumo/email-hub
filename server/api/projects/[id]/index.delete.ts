import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { emailChatMessages, emailProjects } from '../../../db/schema'
import { requireUser } from '../../../utils/auth'
import { requireOwnedProject } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  await requireOwnedProject(id, user.id)

  const db = getDb()
  await db.delete(emailChatMessages).where(eq(emailChatMessages.projectId, id))
  await db.delete(emailProjects).where(eq(emailProjects.id, id))
  return { ok: true }
})
