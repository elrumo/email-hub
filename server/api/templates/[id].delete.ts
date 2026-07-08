import { deleteUserTemplate } from '../../utils/parse'
import { requireUser } from '../../utils/auth'
import { requireOwnedTemplate } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  await requireOwnedTemplate(id, user.id)
  await deleteUserTemplate(id)
  return { ok: true }
})
