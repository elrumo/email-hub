import type { PublicUser } from '~~/server/utils/auth'

/**
 * Client auth state. The current user is loaded once (SSR-friendly via
 * useState) and refreshed after login/signup/logout.
 */
export function useAuth() {
  const user = useState<PublicUser | null>('auth:user', () => null)
  const loaded = useState<boolean>('auth:loaded', () => false)

  async function fetchUser() {
    // useRequestFetch forwards the incoming request's cookies during SSR —
    // plain $fetch would always see a logged-out session on the server.
    const requestFetch = useRequestFetch()
    try {
      const { user: u } = await requestFetch<{ user: PublicUser | null }>('/api/auth/me')
      user.value = u
      loaded.value = true
    } catch {
      user.value = null
    }
  }

  async function login(email: string, password: string) {
    const { user: u } = await $fetch<{ user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    })
    user.value = u
    return u
  }

  async function signup(email: string, password: string, name?: string) {
    const { user: u } = await $fetch<{ user: PublicUser }>('/api/auth/signup', {
      method: 'POST',
      body: { email, password, name }
    })
    user.value = u
    return u
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/login')
  }

  return { user, loaded, fetchUser, login, signup, logout }
}
