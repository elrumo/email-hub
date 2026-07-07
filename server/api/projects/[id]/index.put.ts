import { updateContainer } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedContainer } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  await requireOwnedContainer(id, user.id)

  const body = await readBody<{ name?: string }>(event)
  const name = (body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'Give the project a name.' })

  const project = await updateContainer(id, { name })
  return { project }
})
