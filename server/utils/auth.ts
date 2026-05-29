import { randomUUID } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import {
  createError,
  deleteCookie,
  getCookie,
  getRequestHeader,
  setCookie,
  type H3Event
} from 'h3'
import { getDb } from '../db'
import { activityLog, sessions, users, type UserRow } from '../db/schema'

/**
 * Authentication primitives for the multi-user model.
 *
 * Sessions are opaque, DB-backed random tokens stored in an httpOnly cookie —
 * there is no JWT and no signing secret; validity is a single DB lookup. The
 * engine never sees a session: per-user isolation is enforced by the `ownerId`
 * column on each owned row (see server/db/schema.ts), so unattended flow runs
 * resolve connections by the flow's owner, not by a request.
 */

export const SESSION_COOKIE = 'dd_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/** A user shape safe to send to the client (no password hash). */
export interface PublicUser {
  id: string
  username: string
  email: string | null
  role: string
  lastLoginAt: number | null
  createdAt: number
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt
  }
}

/** argon2id hash via Bun's built-in password helper (no dependency). */
export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id' })
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash)
}

/** Create a session row and return its token (the row id). */
export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const db = getDb()
  const now = Date.now()
  const id = randomUUID()
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt: now + SESSION_TTL_MS,
    userAgent: userAgent ?? null,
    createdAt: now
  })
  return id
}

/** Set the session cookie on the response. `secure` follows the request proto. */
export function setSessionCookie(event: H3Event, token: string): void {
  const proto = getRequestHeader(event, 'x-forwarded-proto')
  const secure = proto ? proto === 'https' : false
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000)
  })
}

export async function clearSession(event: H3Event): Promise<void> {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.id, token))
  }
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

/**
 * Resolve the user for this request from the session cookie. Caches the result
 * on event.context so middleware and handlers share a single lookup. Expired
 * sessions are rejected and pruned. Returns null when unauthenticated.
 */
export async function getSessionUser(event: H3Event): Promise<UserRow | null> {
  if (event.context.user !== undefined) {
    return event.context.user as UserRow | null
  }

  let user: UserRow | null = null
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    const db = getDb()
    const rows = await db.select().from(sessions).where(eq(sessions.id, token))
    const session = rows[0]
    if (session) {
      if (session.expiresAt < Date.now()) {
        // expired — prune and treat as unauthenticated
        await db.delete(sessions).where(eq(sessions.id, token))
      } else {
        const urows = await db.select().from(users).where(eq(users.id, session.userId))
        user = urows[0] ?? null
      }
    }
  }

  event.context.user = user
  return user
}

/** Require an authenticated user; throws 401 otherwise. */
export async function requireUser(event: H3Event): Promise<UserRow> {
  const user = await getSessionUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return user
}

/** Require an admin user; throws 401/403. */
export async function requireAdmin(event: H3Event): Promise<UserRow> {
  const user = await requireUser(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}

/** True when no users exist yet (drives the first-run setup flow). */
export async function needsSetup(): Promise<boolean> {
  const rows = await getDb().select({ id: users.id }).from(users).limit(1)
  return rows.length === 0
}

/**
 * Record a user action. Fire-and-forget: logging must never break the request
 * path, so failures are swallowed (logged to console only).
 */
export async function logActivity(
  userId: string,
  action: string,
  opts?: { entityType?: string, entityId?: string, detail?: Record<string, unknown> }
): Promise<void> {
  try {
    await getDb().insert(activityLog).values({
      id: randomUUID(),
      userId,
      action,
      entityType: opts?.entityType ?? null,
      entityId: opts?.entityId ?? null,
      detail: opts?.detail ?? null,
      createdAt: Date.now()
    })
  } catch (e) {
    console.error('[auth] logActivity failed:', e instanceof Error ? e.message : e)
  }
}

/** Best-effort prune of expired sessions (called occasionally). */
export async function pruneExpiredSessions(): Promise<void> {
  await getDb().delete(sessions).where(lt(sessions.expiresAt, Date.now())).catch(() => {})
}

// re-export to keep `and` import honest for callers that compose filters
export { and as _and }
