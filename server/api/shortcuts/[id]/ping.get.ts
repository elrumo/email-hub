import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { shortcuts } from '../../../db/schema'
import { requireUser } from '../../../utils/auth'

/**
 * Liveness check for a shortcut, proxied through the server so it works for any
 * URL regardless of CORS. Polled by the client every `pingInterval` seconds
 * while a page is open; results are not persisted. A GET that returns any HTTP
 * response < 500 counts as "up". The 8s timeout caps a slow target.
 *
 * NOTE: this is a deliberate, auth-gated proxy to user-entered URLs. The app is
 * a single-user, access-controlled self-hosted tool (see db/schema.ts), so the
 * SSRF surface is accepted by design — the same as the flow HTTP actions.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const rows = await db.select().from(shortcuts).where(and(eq(shortcuts.id, id), eq(shortcuts.ownerId, user.id)))
  const shortcut = rows[0]
  if (!shortcut) throw createError({ statusCode: 404, statusMessage: 'shortcut not found' })

  const target = shortcut.pingUrl || shortcut.url
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'dokploy-doctor/ping' }
    })
    const latency = Date.now() - start
    return {
      ok: res.status < 500,
      status: res.status,
      latency,
      checkedAt: Date.now()
    }
  } catch (e: unknown) {
    const aborted = (e as { name?: string })?.name === 'AbortError'
    return {
      ok: false,
      status: null,
      latency: Date.now() - start,
      error: aborted ? 'timed out' : 'unreachable',
      checkedAt: Date.now()
    }
  } finally {
    clearTimeout(timer)
  }
})
