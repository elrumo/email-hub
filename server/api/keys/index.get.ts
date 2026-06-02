import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { apiKeys } from '../../db/schema'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await getDb()
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.ownerId, user.id))
    .orderBy(desc(apiKeys.createdAt))
  return {
    keys: rows.map(k => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
      createdAt: k.createdAt
    }))
  }
})
