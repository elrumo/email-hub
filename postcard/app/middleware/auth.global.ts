/**
 * Guard the studio (/app/**). Marketing, auth and docs pages are public. We
 * resolve the session via the API (cookie is forwarded automatically on SSR).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/app')) return

  const { user, loaded, fetchUser } = useAuth()
  if (!loaded.value) await fetchUser()

  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
