import {
  countUsers,
  createUser,
  findUserByEmail
} from '../../utils/parse'
import {
  createSession,
  hashPassword,
  isAlwaysAdmin,
  setSessionCookie,
  toPublicUser
} from '../../utils/auth'
import { fireTrigger } from '../../utils/triggers'
import { assertRateLimit } from '../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  // Keep bots from mass-creating accounts: 5 signups per IP per hour.
  assertRateLimit(event, 'signup', {
    limit: 5,
    windowMs: 60 * 60_000,
    message: 'Too many accounts created from this address — try again later.'
  })

  const body = await readBody<{ email?: string, password?: string, name?: string }>(event)
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const name = (body.name ?? '').trim() || null

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw createError({ statusCode: 422, statusMessage: 'Enter a valid email address.' })
  }
  if (password.length < 8) {
    throw createError({ statusCode: 422, statusMessage: 'Password must be at least 8 characters.' })
  }

  const existing = await findUserByEmail(email)
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists.' })
  }

  const role = isAlwaysAdmin(email) || await countUsers() === 0 ? 'admin' : 'user'
  const user = await createUser({
    email,
    name,
    passwordHash: await hashPassword(password),
    role,
    plan: 'free',
    planStatus: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    lastLoginAt: Date.now()
  })

  const token = await createSession(user.id, getRequestHeader(event, 'user-agent'))
  setSessionCookie(event, token)

  // Fire-and-forget: the welcome email must never block or fail signup.
  void fireTrigger('welcome', user)

  return { user: toPublicUser(user) }
})
