import { asc, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { emailChatMessages, emailProjects } from '../../../db/schema'

/** Fetch one project with its full document and chat history. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = getDb()

  const rows = await db.select().from(emailProjects).where(eq(emailProjects.id, id))
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'email project not found' })

  const msgs = await db
    .select()
    .from(emailChatMessages)
    .where(eq(emailChatMessages.projectId, id))
    .orderBy(asc(emailChatMessages.createdAt))

  return {
    id: project.id,
    name: project.name,
    document: project.document,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    messages: msgs.map(m => ({ id: m.id, role: m.role, parts: m.parts }))
  }
})
