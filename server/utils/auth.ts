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
  deleteSession,
  findSession,
  findUserById,
  pruneExpiredSessionRecords,
  type AppUser
} from './parse'

export const SESSION_COOKIE = 'pc_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

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
  const id = randomUUID()
  await createSessionRecord({
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
  if (token) await deleteSession(token)
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export async function getSessionUser(event: H3Event): Promise<AppUser | null> {
  if (event.context.user !== undefined) return event.context.user as AppUser | null

  let user: AppUser | null = null
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    const session = await findSession(token)
    if (session) {
      if (session.expiresAt < Date.now()) {
        await deleteSession(token)
      } else {
        user = await findUserById(session.userId)
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

export async function pruneExpiredSessions(): Promise<void> {
  await pruneExpiredSessionRecords(Date.now()).catch(() => {})
}
