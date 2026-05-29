import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { users } from '../../db/schema'
import { hashPassword, logActivity, requireUser, verifyPassword } from '../../utils/auth'

/** Change the current user's password. Body: { currentPassword, newPassword }. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event).catch(() => ({})) as {
    currentPassword?: string
    newPassword?: string
  }
  const currentPassword = body.currentPassword || ''
  const newPassword = body.newPassword || ''

  if (newPassword.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'new password must be at least 8 characters' })
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw createError({ statusCode: 401, statusMessage: 'current password is incorrect' })
  }

  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: Date.now() })
    .where(eq(users.id, user.id))

  await logActivity(user.id, 'auth.password_change')
  return { ok: true }
})
