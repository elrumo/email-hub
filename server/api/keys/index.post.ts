import { and, count, eq, isNull } from 'drizzle-orm'
import { getDb } from '../../db'
import { apiKeys } from '../../db/schema'
import { requireUser } from '../../utils/auth'
import { generateKey, newApiKeyId } from '../../utils/apiKey'
import { planFor } from '../../utils/plans'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ name?: string }>(event)
  const name = (body.name ?? '').trim() || 'API key'

  const db = getDb()
  const countRows = await db
    .select({ n: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.ownerId, user.id), isNull(apiKeys.revokedAt)))
  const n = countRows[0]?.n ?? 0
  const limit = planFor(user.plan).limits.apiKeys
  if (n >= limit) {
    throw createError({ statusCode: 402, statusMessage: `Your plan allows ${limit} active API key(s). Revoke one or upgrade.` })
  }

  const { secret, prefix, hash } = generateKey()
  const [row] = await db.insert(apiKeys).values({
    id: newApiKeyId(),
    ownerId: user.id,
    name,
    prefix,
    hash,
    createdAt: Date.now()
  }).returning()

  // The plaintext secret is shown exactly once.
  return {
    key: { id: row!.id, name: row!.name, prefix: row!.prefix, createdAt: row!.createdAt },
    secret
  }
})
