import { requireUser } from '../../utils/auth'
import { requireOwnedTemplate } from '../../utils/projects'

/** Full saved template (with document) — fetched when the user picks it. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const template = await requireOwnedTemplate(id, user.id)
  return { template }
})
