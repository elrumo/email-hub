import { countActiveApiKeys, createApiKeyRecord } from '../../utils/parse'
import { requireUser } from '../../utils/auth'
import { generateKey } from '../../utils/apiKey'
import { planFor } from '../../utils/plans'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ name?: string }>(event)
  const name = (body.name ?? '').trim() || 'API key'

  const n = await countActiveApiKeys(user.id)
  const limit = planFor(user.plan).limits.apiKeys
  if (n >= limit) {
    throw createError({ statusCode: 402, statusMessage: `Your plan allows ${limit} active API key(s). Revoke one or upgrade.` })
  }

  const { secret, prefix, hash } = generateKey()
  const row = await createApiKeyRecord({
    ownerId: user.id,
    name,
    prefix,
    hash,
    lastUsedAt: null,
    revokedAt: null
  })

  return {
    key: { id: row.id, name: row.name, prefix: row.prefix, createdAt: row.createdAt },
    secret
  }
})
