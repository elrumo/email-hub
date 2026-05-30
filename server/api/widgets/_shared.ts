import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db'
import { boards, type NewWidgetRow } from '../../db/schema'

export const WIDGET_KINDS = ['shortcut', 'flow', 'monitor', 'note', 'section', 'image', 'iframe'] as const

/** Tile kinds that carry their own `content` instead of pointing at an entity. */
export const SELF_CONTAINED_KINDS = ['note', 'section', 'image', 'iframe'] as const

/** Self-contained kinds whose `content` is a URL (image src / iframe src). */
export const URL_KINDS = ['image', 'iframe'] as const

/** Allowed per-tile card chrome. */
export const CARD_STYLES = ['shadow', 'outline', 'none'] as const
export type CardStyle = (typeof CARD_STYLES)[number]

/** Allowed per-tile background fill. */
export const CARD_BGS = ['none', 'solid'] as const
export type CardBg = (typeof CARD_BGS)[number]

/**
 * Coerce a colour value to a safe hex string (`#rgb`, `#rrggbb`, `#rrggbbaa`)
 * or null. Rejects anything else so a custom background can't smuggle arbitrary
 * CSS into the inline `style` it drives on public boards.
 */
function normalizeHexColor(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  if (!s) return null
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) ? s.toLowerCase() : null
}

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

type WidgetFields = Pick<NewWidgetRow, 'kind' | 'refId' | 'content' | 'cardStyle' | 'bg' | 'bgLight' | 'bgDark' | 'w' | 'h' | 'sortOrder'>

// Bento spans are grid cells: 1–16 (the grid is up to 16 columns wide). Sections
// ignore width but still pass through here, so the same clamp applies.
const MAX_SPAN = 16
function clampSpan(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_SPAN, Math.max(1, Math.round(n)))
}

function isSelfContained(kind: WidgetKind): boolean {
  return (SELF_CONTAINED_KINDS as readonly string[]).includes(kind)
}

function isUrlKind(kind: WidgetKind): boolean {
  return (URL_KINDS as readonly string[]).includes(kind)
}

/**
 * Validate the URL stored in an image/iframe tile's `content`. Rejects unsafe
 * schemes (e.g. `javascript:`) since this content is rendered as an `<img src>`
 * / `<iframe src>`, including on public boards. Images may also use a
 * `data:image/…` URI; iframes must be http(s) (or protocol-relative).
 */
function normalizeUrlContent(kind: WidgetKind, content: string | null): string {
  const url = (content ?? '').trim()
  if (!url) {
    throw createError({ statusCode: 400, statusMessage: `${kind} tiles need a URL` })
  }
  const ok = kind === 'image'
    ? /^(https?:\/\/|\/\/|data:image\/)/i.test(url)
    : /^(https?:\/\/|\/\/)/i.test(url)
  if (!ok) {
    throw createError({
      statusCode: 400,
      statusMessage: kind === 'image'
        ? 'image URL must start with http(s):// or be a data:image/ URI'
        : 'iframe URL must start with http(s)://'
    })
  }
  return url
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

  if (!isSelfContained(kind) && !refId) {
    throw createError({ statusCode: 400, statusMessage: `${kind} widgets need a refId` })
  }

  let content = b.content !== undefined
    ? (b.content === null ? null : String(b.content))
    : existing.content ?? null

  if (isUrlKind(kind)) content = normalizeUrlContent(kind, content)

  const cardStyle = (b.cardStyle !== undefined ? String(b.cardStyle) : existing.cardStyle ?? 'shadow') as CardStyle
  if (!CARD_STYLES.includes(cardStyle)) {
    throw createError({ statusCode: 400, statusMessage: `cardStyle must be one of: ${CARD_STYLES.join(', ')}` })
  }

  const bg = (b.bg !== undefined ? String(b.bg) : existing.bg ?? 'none') as CardBg
  if (!CARD_BGS.includes(bg)) {
    throw createError({ statusCode: 400, statusMessage: `bg must be one of: ${CARD_BGS.join(', ')}` })
  }
  // Colours are only meaningful for a solid fill; clear them otherwise so a tile
  // reset back to "none" doesn't keep stale swatches around.
  const bgLight = bg === 'solid'
    ? (b.bgLight !== undefined ? normalizeHexColor(b.bgLight) : existing.bgLight ?? null)
    : null
  const bgDark = bg === 'solid'
    ? (b.bgDark !== undefined ? normalizeHexColor(b.bgDark) : existing.bgDark ?? null)
    : null

  return {
    kind,
    refId: isSelfContained(kind) ? null : refId,
    content: isSelfContained(kind) ? content : null,
    cardStyle,
    bg,
    bgLight,
    bgDark,
    w: clampSpan(b.w, existing.w ?? 1),
    h: clampSpan(b.h, existing.h ?? 1),
    sortOrder: b.sortOrder !== undefined ? (Number(b.sortOrder) || 0) : existing.sortOrder ?? 0
  }
}
