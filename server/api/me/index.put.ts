import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { users } from '../../db/schema'
import { requireUser, toPublicUser } from '../../utils/auth'

/** Update the current user's profile. Body: { email? }. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event).catch(() => ({})) as { email?: string }

  const update: Record<string, unknown> = { updatedAt: Date.now() }
  if (body.email !== undefined) update.email = body.email.trim() || null

  const db = getDb()
  await db.update(users).set(update).where(eq(users.id, user.id))
  const row = (await db.select().from(users).where(eq(users.id, user.id)))[0]!
  return { user: toPublicUser(row) }
})
