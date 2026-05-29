import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { pushSubscriptions } from '../../db/schema'

/** Remove a device's subscription (user toggled notifications off). */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint) throw createError({ statusCode: 400, statusMessage: 'endpoint is required' })

  const db = getDb()
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  return { ok: true }
})
