import { getSessionUser, toPublicUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)
  return { user: user ? toPublicUser(user) : null }
})
