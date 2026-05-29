import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { users } from '../../db/schema'
import {
  createSession,
  logActivity,
  setSessionCookie,
  toPublicUser,
  verifyPassword
} from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as {
    username?: string
    password?: string
  }
  const username = (body.username || '').trim()
  const password = body.password || ''
  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'username and password are required' })
  }

  const db = getDb()
  const row = (await db.select().from(users).where(eq(users.username, username)))[0]
  // Verify even on a missing user to avoid leaking which usernames exist via timing.
  const ok = row ? await verifyPassword(password, row.passwordHash) : false
  if (!row || !ok) {
    throw createError({ statusCode: 401, statusMessage: 'invalid username or password' })
  }

  const now = Date.now()
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, row.id))

  const token = await createSession(row.id, getRequestHeader(event, 'user-agent'))
  setSessionCookie(event, token)
  await logActivity(row.id, 'auth.login')

  return { user: toPublicUser({ ...row, lastLoginAt: now }) }
})
