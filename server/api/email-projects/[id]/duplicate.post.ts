import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { emailProjects } from '../../../db/schema'

/** Duplicate a project's document into a new project (chat history is not copied). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = getDb()

  const rows = await db.select().from(emailProjects).where(eq(emailProjects.id, id))
  const src = rows[0]
  if (!src) throw createError({ statusCode: 404, statusMessage: 'email project not found' })

  const now = Date.now()
  const newId = randomUUID()
  const name = `${src.name} (copy)`
  await db.insert(emailProjects).values({
    id: newId,
    name,
    // structuredClone keeps the copy independent of the source document object
    document: structuredClone(src.document),
    createdAt: now,
    updatedAt: now
  })

  setResponseStatus(event, 201)
  return { id: newId, name }
})
