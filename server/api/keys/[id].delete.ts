import { createError } from 'h3'
import { listApiKeys, revokeApiKey } from '../../utils/parse'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const keys = await listApiKeys(user.id)
  const key = keys.find(k => k.id === id)
  if (!key) throw createError({ statusCode: 404, statusMessage: 'API key not found' })
  await revokeApiKey(id)
  return { ok: true }
})
