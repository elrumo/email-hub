import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { pushSubscriptions } from '../../db/schema'

/**
 * Save (or refresh) a browser PushSubscription. Idempotent on the endpoint —
 * re-subscribing the same device updates the stored keys rather than
 * duplicating. Body is the `PushSubscription.toJSON()` object.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const sub = body?.subscription ?? body
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : ''
  if (!endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw createError({ statusCode: 400, statusMessage: 'invalid push subscription' })
  }

  const db = getDb()
  const now = Date.now()
  const userAgent = getRequestHeader(event, 'user-agent') ?? null

  await db
    .insert(pushSubscriptions)
    .values({ id: randomUUID(), endpoint, subscription: sub, userAgent, createdAt: now })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { subscription: sub, userAgent }
    })

  setResponseStatus(event, 201)
  return { ok: true }
})
