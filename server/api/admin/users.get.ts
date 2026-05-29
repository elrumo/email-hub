import { asc } from 'drizzle-orm'
import { getDb } from '../../db'
import { users } from '../../db/schema'
import { requireAdmin, toPublicUser } from '../../utils/auth'
import { computeUserStats } from '../../utils/stats'

/** Admin overview: every user with their aggregate stats. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = getDb()
  const rows = await db.select().from(users).orderBy(asc(users.createdAt))
  return await Promise.all(
    rows.map(async u => ({
      ...toPublicUser(u),
      stats: await computeUserStats(u.id)
    }))
  )
})
