import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db'
import { boards, type NewWidgetRow } from '../../db/schema'

export const WIDGET_KINDS = ['shortcut', 'flow', 'monitor', 'note'] as const

/**
 * Resolve a board id that belongs to `ownerId`. When `boardId` is given it must
 * be one of the user's boards; otherwise the user's default board is used (the
 * first board as a fallback). Throws 400/404 on a missing/foreign board.
 */
export async function resolveOwnedBoard(
  db: DB,
  ownerId: string,
  boardId: string | null | undefined
): Promise<string> {
  if (boardId) {
    const rows = await db
      .select({ id: boards.id })
      .from(boards)
      .where(and(eq(boards.id, boardId), eq(boards.ownerId, ownerId)))
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'board not found' })
    return rows[0].id
  }
  const owned = await db
    .select({ id: boards.id, isDefault: boards.isDefault })
    .from(boards)
    .where(eq(boards.ownerId, ownerId))
  const target = owned.find(b => b.isDefault) ?? owned[0]
  if (!target) throw createError({ statusCode: 400, statusMessage: 'no board to add to' })
  return target.id
}
export type WidgetKind = (typeof WIDGET_KINDS)[number]

type WidgetFields = Pick<NewWidgetRow, 'kind' | 'refId' | 'content' | 'w' | 'h' | 'sortOrder'>

function clampSpan(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(4, Math.max(1, Math.round(n)))
}

/**
 * Validate + coerce a widget create/update body, merging over `existing` for
 * partial PUTs. Throws createError on bad input. `kind` is immutable after
 * create, so update bodies that omit it inherit the existing kind.
 */
export function normalizeWidgetBody(
  body: Record<string, unknown> | null | undefined,
  existing: Partial<WidgetFields>
): WidgetFields {
  const b = body ?? {}

  const kind = (b.kind !== undefined ? String(b.kind) : existing.kind ?? '') as WidgetKind
  if (!WIDGET_KINDS.includes(kind)) {
    throw createError({ statusCode: 400, statusMessage: `kind must be one of: ${WIDGET_KINDS.join(', ')}` })
  }

  const refId = b.refId !== undefined
    ? (String(b.refId).trim() || null)
    : existing.refId ?? null

  if (kind !== 'note' && !refId) {
    throw createError({ statusCode: 400, statusMessage: `${kind} widgets need a refId` })
  }

  const content = b.content !== undefined
    ? (b.content === null ? null : String(b.content))
    : existing.content ?? null

  return {
    kind,
    refId: kind === 'note' ? null : refId,
    content: kind === 'note' ? content : null,
    w: clampSpan(b.w, existing.w ?? 1),
    h: clampSpan(b.h, existing.h ?? 1),
    sortOrder: b.sortOrder !== undefined ? (Number(b.sortOrder) || 0) : existing.sortOrder ?? 0
  }
}
