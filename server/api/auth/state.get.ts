import { getSessionUser, needsSetup, toPublicUser } from '../../utils/auth'

/**
 * Public auth state: whether the instance still needs its first admin, and the
 * current user (if any). Always reachable (allowlisted in the auth middleware)
 * so the client can decide between /setup, /login, and the app.
 */
export default defineEventHandler(async (event) => {
  const [setup, user] = await Promise.all([needsSetup(), getSessionUser(event)])
  return {
    needsSetup: setup,
    user: user ? toPublicUser(user) : null
  }
})
