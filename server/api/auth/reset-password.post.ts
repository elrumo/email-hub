import { deleteSessionsForUser, findUserByResetTokenHash, updateUser } from '../../utils/parse'
import {
  createSession,
  hashPassword,
  hashToken,
  setSessionCookie,
  toPublicUser
} from '../../utils/auth'

/**
 * Complete a password reset: verify the token, set the new password, and log
 * the user in. All of the user's existing sessions are destroyed so a stolen
 * session can't outlive the reset.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: string, password?: string }>(event)
  const token = (body.token ?? '').trim()
  const password = body.password ?? ''

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Missing reset token.' })
  }
  if (password.length < 8) {
    throw createError({ statusCode: 422, statusMessage: 'Password must be at least 8 characters.' })
  }

  const user = await findUserByResetTokenHash(hashToken(token))
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'This reset link is invalid or has expired.' })
  }

  await updateUser(user.id, {
    passwordHash: await hashPassword(password),
    resetTokenHash: null,
    resetTokenExpiresAt: null
  })
  await deleteSessionsForUser(user.id)

  const sessionToken = await createSession(user.id, getRequestHeader(event, 'user-agent'))
  setSessionCookie(event, sessionToken)
  return { user: toPublicUser(user) }
})
