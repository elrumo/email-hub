import { randomUUID } from 'node:crypto'
import {
  createError,
  deleteCookie,
  getCookie,
  getRequestHeader,
  setCookie,
  type H3Event
} from 'h3'
import {
  createSessionRecord,
  deleteSessionByToken,
  findSessionByToken,
  findUserById,
  pruneExpiredSessionRecords,
  updateUser,
  type AppUser
} from './parse'

export const SESSION_COOKIE = 'pc_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Emails that always hold admin rights, no matter how the account was
 * created. Extendable via the ADMIN_EMAILS env var (comma separated).
 */
const ALWAYS_ADMIN_EMAILS = new Set(
  ['elrumo97@me.com', ...(process.env.ADMIN_EMAILS ?? '').split(',')]
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
)

export function isAlwaysAdmin(email: string | null | undefined): boolean {
  return !!email && ALWAYS_ADMIN_EMAILS.has(email.toLowerCase())
}

export interface PublicUser {
  id: string
  email: string
  name: string | null
  role: string
  plan: string
  planStatus: string | null
  createdAt: number
}

export function toPublicUser(u: AppUser): PublicUser {
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
  const token = randomUUID()
  await createSessionRecord({
    token,
    userId,
    expiresAt: now + SESSION_TTL_MS,
    userAgent: userAgent ?? null
  })
  // opportunistic cleanup so expired sessions don't accumulate forever
  void pruneExpiredSessions()
  return token
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
  if (token) await deleteSessionByToken(token)
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export async function getSessionUser(event: H3Event): Promise<AppUser | null> {
  if (event.context.user !== undefined) return event.context.user as AppUser | null

  let user: AppUser | null = null
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    const session = await findSessionByToken(token)
    if (session) {
      if (session.expiresAt < Date.now()) {
        await deleteSessionByToken(token)
      } else {
        user = await findUserById(session.userId)
        if (user && user.role !== 'admin' && isAlwaysAdmin(user.email)) {
          user = await updateUser(user.id, { role: 'admin' })
        }
      }
    }
  }
  event.context.user = user
  return user
}

export async function requireUser(event: H3Event): Promise<AppUser> {
  const user = await getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}

export async function requireAdmin(event: H3Event): Promise<AppUser> {
  const user = await requireUser(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required.' })
  }
  return user
}

export async function pruneExpiredSessions(): Promise<void> {
  await pruneExpiredSessionRecords(Date.now()).catch(() => {})
}
