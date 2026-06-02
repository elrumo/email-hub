import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { emailProjects } from '../../db/schema'
import { requireUser } from '../../utils/auth'
import { projectSummary } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await getDb()
    .select()
    .from(emailProjects)
    .where(eq(emailProjects.ownerId, user.id))
    .orderBy(desc(emailProjects.updatedAt))
  return { projects: rows.map(projectSummary) }
})
