import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { emailProjects } from '../../../db/schema'
import { requireApiUser } from '../../../utils/apiKey'
import { projectSummary } from '../../../utils/projects'

/** Public API: list the authenticated key owner's email projects. */
export default defineEventHandler(async (event) => {
  const user = await requireApiUser(event)
  const rows = await getDb()
    .select()
    .from(emailProjects)
    .where(eq(emailProjects.ownerId, user.id))
    .orderBy(desc(emailProjects.updatedAt))
  return rows.map(projectSummary)
})
