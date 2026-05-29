import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { activityLog } from '../../db/schema'
import { requireUser } from '../../utils/auth'

/** The current user's recent activity log (most recent first, capped). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const limit = Math.min(Number(getQuery(event).limit ?? 50) || 50, 200)
  const db = getDb()
  return await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.userId, user.id))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit)
})
