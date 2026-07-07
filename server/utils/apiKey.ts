import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createError, getRequestHeader, type H3Event } from 'h3'
import { findUserById, getActiveApiKeyByHash, touchApiKey, type AppUser } from './parse'

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

export async function requireApiUser(event: H3Event): Promise<AppUser> {
  const header = getRequestHeader(event, 'authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const secret = match?.[1]?.trim()
  if (!secret || !secret.startsWith(PREFIX)) {
    throw createError({ statusCode: 401, statusMessage: 'Missing or malformed API key' })
  }

  const key = await getActiveApiKeyByHash(hashKey(secret))
  if (!key) throw createError({ statusCode: 401, statusMessage: 'Invalid API key' })

  void touchApiKey(key.id).catch(() => {})

  const user = await findUserById(key.ownerId)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Invalid API key' })
  return user
}
