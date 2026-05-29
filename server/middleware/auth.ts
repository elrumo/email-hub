import { getSessionUser } from '../utils/auth'

/**
 * Session gating. Replaces the old shared-credential HTTP Basic auth.
 *
 * Pages (non-/api/ paths) are always served — the client-side route middleware
 * (app/middleware/auth.global.ts) handles redirecting unauthenticated visitors
 * to /login or /setup. Server endpoints under /api/ require a valid session,
 * except a small allowlist:
 *   - /api/auth/*  : login/signup/setup/logout/state (bootstrap the session)
 *   - /api/hooks/* : inbound webhooks authenticate via their own per-flow secret
 *
 * On success the resolved user is cached on event.context.user for handlers.
 */
export default defineEventHandler(async (event) => {
  const path = event.path || ''

  // never gate health checks
  if (path === '/healthz') return

  // only guard the API surface; pages are gated client-side
  if (!path.startsWith('/api/')) return

  // allowlisted API endpoints that establish/inspect auth or self-authenticate
  if (path.startsWith('/api/auth/')) return
  if (path.startsWith('/api/hooks/')) return

  const user = await getSessionUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
})
