import { findUserByEmail, updateUser } from '../../utils/parse'
import {
  createSession,
  isAlwaysAdmin,
  setSessionCookie,
  toPublicUser,
  verifyPassword
} from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, password?: string }>(event)
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''

  const user = await findUserByEmail(email)
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, '$argon2id$v=19$m=65536,t=2,p=1$AAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').catch(() => false)

  if (!user || !ok) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect email or password.' })
  }

  const updated = await updateUser(user.id, {
    lastLoginAt: Date.now(),
    ...(user.role !== 'admin' && isAlwaysAdmin(email) ? { role: 'admin' } : {})
  })
  const token = await createSession(user.id, getRequestHeader(event, 'user-agent'))
  setSessionCookie(event, token)
  return { user: toPublicUser(updated) }
})
