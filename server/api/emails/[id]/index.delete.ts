import { deleteChatMessages, deleteProject } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedProject } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  await requireOwnedProject(id, user.id)
  await deleteChatMessages(id)
  await deleteProject(id)
  return { ok: true }
})
