/**
 * Authentication primitives. Email + password (argon2id via Bun.password) with
 * opaque, DB-backed session tokens stored in an httpOnly cookie — no JWT, no
 * signing secret; validity is a single DB lookup. Per-user isolation is enforced
 * by the `ownerId` column on owned rows.
 */
import { randomUUID } from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import {
  createError,
  deleteCookie,
  getCookie,
  getRequestHeader,
  setCookie,
  type H3Event
} from 'h3'
import { getDb } from '../db'
import { sessions, users, type UserRow } from '../db/schema'

export const SESSION_COOKIE = 'pc_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/** A user shape safe to send to the client (no password hash). */
export interface PublicUser {
  id: string
  email: string
  name: string | null
  role: string
  plan: string
  planStatus: string | null
  createdAt: number
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    plan: u.plan,
    planStatus: u.planStatus,
    createdAt: u.createdAt
  }
}

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id' })
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash)
}

export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const now = Date.now()
  const id = randomUUID()
  await getDb().insert(sessions).values({
    id,
    userId,
    expiresAt: now + SESSION_TTL_MS,
    userAgent: userAgent ?? null,
    createdAt: now
  })
  return id
}

export function setSessionCookie(event: H3Event, token: string): void {
  const forced = useRuntimeConfig().sessionCookieSecure === '1'
  const proto = getRequestHeader(event, 'x-forwarded-proto')
  const secure = forced || proto === 'https'
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000)
  })
}

export async function destroySession(event: H3Event): Promise<void> {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) await getDb().delete(sessions).where(eq(sessions.id, token))
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

/** Resolve the user for this request from the session cookie (cached per event). */
export async function getSessionUser(event: H3Event): Promise<UserRow | null> {
  if (event.context.user !== undefined) return event.context.user as UserRow | null

  let user: UserRow | null = null
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    const db = getDb()
    const rows = await db.select().from(sessions).where(eq(sessions.id, token))
    const session = rows[0]
    if (session) {
      if (session.expiresAt < Date.now()) {
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

export async function requireUser(event: H3Event): Promise<UserRow> {
  const user = await getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}

export async function pruneExpiredSessions(): Promise<void> {
  await getDb().delete(sessions).where(lt(sessions.expiresAt, Date.now())).catch(() => {})
}
