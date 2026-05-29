import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { flows } from '../../db/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = getDb()
  const rows = await db.select().from(flows).where(eq(flows.ownerId, user.id)).orderBy(desc(flows.updatedAt))
  return rows.map(f => ({
    id: f.id,
    name: f.name,
    description: f.description,
    enabled: f.enabled,
    publicTrigger: f.publicTrigger,
    definition: f.definition,
    cron: f.cron,
    runAt: f.runAt,
    timezone: f.timezone,
    lastRunAt: f.lastRunAt,
    updatedAt: f.updatedAt
  }))
})
