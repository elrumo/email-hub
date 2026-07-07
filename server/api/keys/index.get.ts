import { listApiKeys } from '../../utils/parse'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await listApiKeys(user.id)
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
