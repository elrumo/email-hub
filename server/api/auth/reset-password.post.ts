import { deleteSessionsForUser, findUserById, updateUser } from '../../utils/parse'
import {
  createSession,
  hashPassword,
  readResetToken,
  resetSigValid,
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

  const invalid = () => createError({ statusCode: 400, statusMessage: 'This reset link is invalid or has expired.' })

  const claims = readResetToken(token)
  if (!claims || claims.exp < Date.now()) throw invalid()

  const user = await findUserById(claims.userId)
  // Verifying against the current passwordHash makes the token single-use: once
  // the password changes below, this same token no longer validates.
  if (!user || !resetSigValid(claims.payload, claims.sig, user.passwordHash)) throw invalid()

  await updateUser(user.id, { passwordHash: await hashPassword(password) })
  await deleteSessionsForUser(user.id)

  const sessionToken = await createSession(user.id, getRequestHeader(event, 'user-agent'))
  setSessionCookie(event, sessionToken)
  return { user: toPublicUser(user) }
})
