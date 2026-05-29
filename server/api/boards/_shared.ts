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
 * Validate a board's chosen avatar. Accepts:
 *   - an empty value → null (fall back to the name monogram)
 *   - a lucide/iconify icon name (e.g. "i-lucide-home")
 *   - an http(s) image URL, or a `data:image/…` URI (an uploaded picture)
 * Rejects anything else (e.g. `javascript:`) since this value is rendered as an
 * `<img src>`, and caps the stored size so a data URI can't bloat the row.
 */
const MAX_ICON_BYTES = 512 * 1024 // generous ceiling for a downscaled avatar data URI

export function normalizeBoardIcon(raw: unknown): string | null {
  if (raw == null) return null
  const icon = String(raw).trim()
  if (!icon) return null
  const ok = /^i-[a-z0-9-]+$/i.test(icon) || /^(https?:\/\/|data:image\/)/i.test(icon)
  if (!ok) {
    throw createError({
      statusCode: 400,
      statusMessage: 'icon must be an icon name, an http(s) image URL, or a data:image/ URI'
    })
  }
  if (icon.length > MAX_ICON_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'icon image is too large' })
  }
  return icon
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
