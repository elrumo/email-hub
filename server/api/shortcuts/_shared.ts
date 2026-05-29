import type { ShortcutRow } from '../../db/schema'

type ShortcutFields = Pick<
  ShortcutRow,
  'name' | 'url' | 'icon' | 'pingEnabled' | 'pingUrl' | 'pingInterval' | 'sortOrder'
>

/** Reject anything that isn't an http(s) URL — guards the ping proxy. */
function assertHttpUrl(value: string, label: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw createError({ statusCode: 400, statusMessage: `${label} must be a valid URL` })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: `${label} must be http or https` })
  }
  return parsed.toString()
}

/**
 * Validate + coerce a shortcut create/update body, merging over `existing` so
 * PUT can send partial bodies. Throws createError on bad input.
 */
export function normalizeShortcutBody(
  body: Record<string, unknown> | null | undefined,
  existing: Partial<ShortcutRow>
): ShortcutFields {
  const b = body ?? {}

  const name = (b.name !== undefined ? String(b.name) : existing.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const rawUrl = b.url !== undefined ? String(b.url).trim() : existing.url ?? ''
  if (!rawUrl) throw createError({ statusCode: 400, statusMessage: 'url is required' })
  const url = assertHttpUrl(rawUrl, 'url')

  const icon = b.icon !== undefined
    ? (String(b.icon).trim() || null)
    : existing.icon ?? null

  const pingEnabled = b.pingEnabled !== undefined
    ? Boolean(b.pingEnabled)
    : existing.pingEnabled ?? false

  const rawPingUrl = b.pingUrl !== undefined
    ? String(b.pingUrl).trim()
    : (existing.pingUrl ?? '')
  const pingUrl = rawPingUrl ? assertHttpUrl(rawPingUrl, 'ping URL') : null

  const rawInterval = b.pingInterval !== undefined
    ? Number(b.pingInterval)
    : existing.pingInterval ?? 30
  if (!Number.isFinite(rawInterval) || rawInterval < 5 || rawInterval > 3600) {
    throw createError({ statusCode: 400, statusMessage: 'ping interval must be between 5 and 3600 seconds' })
  }
  const pingInterval = Math.round(rawInterval)

  const sortOrder = b.sortOrder !== undefined
    ? Number(b.sortOrder) || 0
    : existing.sortOrder ?? 0

  return { name, url, icon, pingEnabled, pingUrl, pingInterval, sortOrder }
}
