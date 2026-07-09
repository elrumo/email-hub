import { deleteChatMessages } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedProject } from '../../../utils/projects'

/** Clear the AI conversation for this email. The document is untouched. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  await requireOwnedProject(id, user.id)
  await deleteChatMessages(id)
  return { ok: true }
})
