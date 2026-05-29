/**
 * Client/server route guard for the multi-user app.
 *
 *  - Before any user exists, every route funnels to /setup (create first admin).
 *  - Unauthenticated visitors are sent to /login (signup lives on that page).
 *  - Authenticated users are bounced off /login and /setup back to the app.
 *  - /admin requires the admin role.
 *
 * The API itself is independently gated server-side (server/middleware/auth.ts),
 * so this is UX, not the security boundary.
 */
const PUBLIC_ROUTES = new Set(['/login', '/setup'])

export default defineNuxtRouteMiddleware(async (to) => {
  // public board views are open to unauthenticated visitors — skip the guard
  // entirely (don't even load auth state, which would 401 on a fresh visitor).
  if (to.path.startsWith('/b/')) return

  const auth = useAuth()

  // load /api/auth/state once; tolerate failure (treated as logged-out)
  try {
    await auth.ensureLoaded()
  } catch {
    if (!PUBLIC_ROUTES.has(to.path)) return navigateTo('/login')
    return
  }

  if (auth.needsSetup.value) {
    return to.path === '/setup' ? undefined : navigateTo('/setup')
  }

  if (!auth.user.value) {
    return PUBLIC_ROUTES.has(to.path) ? undefined : navigateTo('/login')
  }

  // logged in: keep them out of the auth pages
  if (PUBLIC_ROUTES.has(to.path)) return navigateTo('/')

  // admin-only area
  if (to.path.startsWith('/admin') && auth.user.value.role !== 'admin') {
    return navigateTo('/')
  }
})
