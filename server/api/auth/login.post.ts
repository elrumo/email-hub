import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { users } from '../../db/schema'
import {
  createSession,
  setSessionCookie,
  toPublicUser,
  verifyPassword
} from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, password?: string }>(event)
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''

  const db = getDb()
  const rows = await db.select().from(users).where(eq(users.email, email))
  const user = rows[0]

  // Constant-ish: always verify against a hash to avoid user enumeration timing.
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, '$argon2id$v=19$m=65536,t=2,p=1$AAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').then(() => false)

  if (!user || !ok) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect email or password.' })
  }

  await db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, user.id))
  const token = await createSession(user.id, getRequestHeader(event, 'user-agent'))
  setSessionCookie(event, token)
  return { user: toPublicUser(user) }
})
