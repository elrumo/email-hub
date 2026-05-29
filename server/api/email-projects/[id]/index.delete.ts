import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { emailProjects } from '../../../db/schema'

/** Delete a project (its chat history cascades via the FK). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  await db.delete(emailProjects).where(eq(emailProjects.id, id))
  return { id, deleted: true }
})
