/**
 * Public API key helpers. Keys look like `pc_live_<random>`; only a SHA-256 of
 * the full secret is stored. The plaintext is returned to the user exactly once.
 * Requests authenticate with `Authorization: Bearer pc_live_…`.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { createError, getRequestHeader, type H3Event } from 'h3'
import { getDb } from '../db'
import { apiKeys, users, type UserRow } from '../db/schema'

const PREFIX = 'pc_live_'

export function hashKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export interface GeneratedKey {
  secret: string
  prefix: string
  hash: string
}

export function generateKey(): GeneratedKey {
  const random = randomBytes(24).toString('base64url')
  const secret = `${PREFIX}${random}`
  return { secret, prefix: secret.slice(0, PREFIX.length + 6), hash: hashKey(secret) }
}

export function newApiKeyId(): string {
  return randomUUID()
}

/**
 * Authenticate a request by its bearer API key. Returns the owning user, or
 * throws 401. Also stamps `lastUsedAt` (best effort).
 */
export async function requireApiUser(event: H3Event): Promise<UserRow> {
  const header = getRequestHeader(event, 'authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const secret = match?.[1]?.trim()
  if (!secret || !secret.startsWith(PREFIX)) {
    throw createError({ statusCode: 401, statusMessage: 'Missing or malformed API key' })
  }
  const db = getDb()
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.hash, hashKey(secret)), isNull(apiKeys.revokedAt)))
  const key = rows[0]
  if (!key) throw createError({ statusCode: 401, statusMessage: 'Invalid API key' })

  void db.update(apiKeys).set({ lastUsedAt: Date.now() }).where(eq(apiKeys.id, key.id)).catch(() => {})

  const urows = await db.select().from(users).where(eq(users.id, key.ownerId))
  const user = urows[0]
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Invalid API key' })
  return user
}
