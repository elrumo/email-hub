import { randomUUID } from 'node:crypto'
import { eq, isNull } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections, flows, monitors, shortcuts, users, widgets } from '../../db/schema'
import {
  createSession,
  hashPassword,
  logActivity,
  needsSetup,
  setSessionCookie,
  toPublicUser
} from '../../utils/auth'

/**
 * First-run bootstrap: create the first user as an admin, then adopt every
 * pre-existing ownerless row (from the single-workspace era) into that admin.
 * Only valid while no users exist — 409 afterward.
 */
export default defineEventHandler(async (event) => {
  if (!(await needsSetup())) {
    throw createError({ statusCode: 409, statusMessage: 'Setup already completed' })
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
  const now = Date.now()
  const id = randomUUID()

  await db.insert(users).values({
    id,
    username,
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  })

  // adopt all ownerless rows into the new admin
  await Promise.all([
    db.update(connections).set({ ownerId: id }).where(isNull(connections.ownerId)),
    db.update(monitors).set({ ownerId: id }).where(isNull(monitors.ownerId)),
    db.update(flows).set({ ownerId: id }).where(isNull(flows.ownerId)),
    db.update(shortcuts).set({ ownerId: id }).where(isNull(shortcuts.ownerId)),
    db.update(widgets).set({ ownerId: id }).where(isNull(widgets.ownerId))
  ])

  const token = await createSession(id, getRequestHeader(event, 'user-agent'))
  setSessionCookie(event, token)
  await logActivity(id, 'auth.setup')

  const row = (await db.select().from(users).where(eq(users.id, id)))[0]!
  return { user: toPublicUser(row) }
})
