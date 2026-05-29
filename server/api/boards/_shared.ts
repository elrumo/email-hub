import { randomUUID } from 'node:crypto'
import { and, eq, ne } from 'drizzle-orm'
import type { DB } from '../../db'
import { boards, connections } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { registerAllIntegrations } from '../../integrations'

/** Turn a board name into a url-safe slug stub (no uniqueness applied yet). */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'board'
}

/**
 * Produce a slug that is unique across ALL boards (slugs are globally unique so
 * the public `/b/<slug>` URL is unambiguous). Appends a short random suffix on
 * collision. `excludeId` lets an update keep its own slug.
 */
export async function uniqueSlug(db: DB, desired: string, excludeId?: string): Promise<string> {
  const stub = slugify(desired)
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? stub : `${stub}-${randomUUID().slice(0, 4)}`
    const rows = await db.select({ id: boards.id }).from(boards).where(eq(boards.slug, candidate))
    const clash = rows.find(r => r.id !== excludeId)
    if (!clash) return candidate
  }
  // extremely unlikely fallback
  return `${stub}-${randomUUID().slice(0, 8)}`
}

/**
 * Make `boardId` the sole default board for `ownerId`, clearing the flag on the
 * user's other boards. Call inside the same request after setting isDefault.
 */
export async function clearOtherDefaults(db: DB, ownerId: string, boardId: string): Promise<void> {
  await db
    .update(boards)
    .set({ isDefault: false, updatedAt: Date.now() })
    .where(and(eq(boards.ownerId, ownerId), ne(boards.id, boardId)))
}

/**
 * Validate a board's chosen analytics connection. Returns the connection id when
 * it belongs to `ownerId` and its integration declares a `webAnalytics`
 * capability; returns `null` for an empty/cleared selection. Throws a 400 when
 * the connection is unknown or can't track. Accepts the raw request value
 * (string | null | undefined).
 */
export async function resolveAnalyticsConnectionId(
  db: DB,
  ownerId: string,
  raw: unknown
): Promise<string | null> {
  if (raw == null || raw === '') return null
  const connectionId = String(raw)
  registerAllIntegrations()
  const row = (await db
    .select({ id: connections.id, integrationId: connections.integrationId })
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.ownerId, ownerId))))[0]
  if (!row) {
    throw createError({ statusCode: 400, statusMessage: 'analytics connection not found' })
  }
  if (!getIntegration(row.integrationId)?.webAnalytics) {
    throw createError({ statusCode: 400, statusMessage: 'that connection can\'t track boards' })
  }
  return connectionId
}
