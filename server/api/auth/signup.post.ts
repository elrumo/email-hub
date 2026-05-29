import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { users } from '../../db/schema'
import {
  createSession,
  hashPassword,
  logActivity,
  needsSetup,
  setSessionCookie,
  toPublicUser
} from '../../utils/auth'

/**
 * Open self-signup. Creates a regular (`user`) account, logs them in. Before
 * the instance has an admin, signup is rejected — the first account must come
 * through /api/auth/setup so it gets admin + adopts existing data.
 */
export default defineEventHandler(async (event) => {
  if (await needsSetup()) {
    throw createError({ statusCode: 409, statusMessage: 'Instance not set up yet' })
  }

  const body = await readBody(event).catch(() => ({})) as {
    username?: string
    password?: string
    email?: string
  }
  const username = (body.username || '').trim()
  const password = body.password || ''
  const email = (body.email || '').trim() || null

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'username and password are required' })
  }
  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'password must be at least 8 characters' })
  }

  const db = getDb()
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username))
  if (existing.length) {
    throw createError({ statusCode: 409, statusMessage: 'username is taken' })
  }

  const now = Date.now()
  const id = randomUUID()
  await db.insert(users).values({
    id,
    username,
    email,
    passwordHash: await hashPassword(password),
    role: 'user',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  })

  const token = await createSession(id, getRequestHeader(event, 'user-agent'))
  setSessionCookie(event, token)
  await logActivity(id, 'auth.signup')

  const row = (await db.select().from(users).where(eq(users.id, id)))[0]!
  return { user: toPublicUser(row) }
})
