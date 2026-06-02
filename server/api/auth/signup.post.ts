import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { users } from '../../db/schema'
import {
  createSession,
  hashPassword,
  setSessionCookie,
  toPublicUser
} from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, password?: string, name?: string }>(event)
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const name = (body.name ?? '').trim() || null

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw createError({ statusCode: 422, statusMessage: 'Enter a valid email address.' })
  }
  if (password.length < 8) {
    throw createError({ statusCode: 422, statusMessage: 'Password must be at least 8 characters.' })
  }

  const db = getDb()
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (existing.length) {
    throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists.' })
  }

  // First user becomes the admin.
  const any = await db.select({ id: users.id }).from(users).limit(1)
  const role = any.length === 0 ? 'admin' : 'user'

  const now = Date.now()
  const id = randomUUID()
  const [user] = await db.insert(users).values({
    id,
    email,
    name,
    passwordHash: await hashPassword(password),
    role,
    plan: 'free',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  }).returning()

  const token = await createSession(user!.id, getRequestHeader(event, 'user-agent'))
  setSessionCookie(event, token)
  return { user: toPublicUser(user!) }
})
