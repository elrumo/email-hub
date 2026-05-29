/**
 * Client/server route guard for the multi-user app.
 *
 *  - Before any user exists, every route funnels to /setup (create first admin).
 *  - `/` is the public marketing landing page — open to unauthenticated visitors.
 *  - Authenticated users are bounced off `/`, /login and /setup to the app home (/home).
 *  - Unauthenticated visitors to any other route are sent to /login (signup lives there).
 *  - /admin requires the admin role.
 *
 * The API itself is independently gated server-side (server/middleware/auth.ts),
 * so this is UX, not the security boundary.
 */
const LANDING = '/'
// Auth pages (no app chrome). The landing page `/` is handled separately: it's
// public, but logged-in users are redirected off it to the app home.
const AUTH_ROUTES = new Set(['/login', '/setup'])

// Routes an unauthenticated visitor is allowed to see (everything else → /login).
function isPublic(path: string) {
  return path === LANDING || AUTH_ROUTES.has(path)
}

export default defineNuxtRouteMiddleware(async (to) => {
  // public board views are open to unauthenticated visitors — skip the guard
  // entirely (don't even load auth state, which would 401 on a fresh visitor).
  if (to.path.startsWith('/b/')) return

  const auth = useAuth()

  // load /api/auth/state once; tolerate failure (treated as logged-out)
  try {
    await auth.ensureLoaded()
  } catch {
    return isPublic(to.path) ? undefined : navigateTo('/login')
  }

  if (auth.needsSetup.value) {
    return to.path === '/setup' ? undefined : navigateTo('/setup')
  }

  if (!auth.user.value) {
    return isPublic(to.path) ? undefined : navigateTo('/login')
  }

  // logged in: keep them off the marketing landing + auth pages, send to the app
  if (to.path === LANDING || AUTH_ROUTES.has(to.path)) return navigateTo('/home')

  // admin-only area
  if (to.path.startsWith('/admin') && auth.user.value.role !== 'admin') {
    return navigateTo('/home')
  }
})
