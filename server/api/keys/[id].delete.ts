import { createError } from 'h3'
import { getApiKeyById, revokeApiKey } from '../../utils/parse'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const key = await getApiKeyById(id)
  if (!key || key.ownerId !== user.id) throw createError({ statusCode: 404, statusMessage: 'API key not found' })
  await revokeApiKey(id)
  return { ok: true }
})
