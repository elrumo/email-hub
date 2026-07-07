import { deleteUserTemplate, getUserTemplate } from '../../utils/parse'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const template = await getUserTemplate(id)
  if (!template || template.ownerId !== user.id) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }
  await deleteUserTemplate(id)
  return { ok: true }
})
