import { updateContainer } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedContainer } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const container = await requireOwnedContainer(id, user.id)

  const body = await readBody<{ userId?: string }>(event)
  if (!body.userId) throw createError({ statusCode: 422, statusMessage: 'userId is required.' })

  const memberIds = (container.memberIds ?? []).filter(m => m !== body.userId)
  await updateContainer(id, { memberIds })
  return { ok: true }
})
