import { findUserById } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedContainer } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const container = await requireOwnedContainer(id, user.id)

  const members = (await Promise.all(
    (container.memberIds ?? []).map(async (mid) => {
      const m = await findUserById(mid)
      return m ? { id: m.id, email: m.email, name: m.name } : null
    })
  )).filter(Boolean)

  return {
    members,
    share: { mode: container.shareMode ?? 'off', token: container.shareToken }
  }
})
