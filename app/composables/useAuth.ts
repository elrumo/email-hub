import type { AuthState, PublicUser } from '~/types'

/**
 * Single source of truth for the current session. Backed by useState so the
 * value is shared across the app and survives navigation. `ensureLoaded` fetches
 * /api/auth/state once (the global route middleware calls it before each guard).
 */
export function useAuth() {
  const user = useState<PublicUser | null>('auth:user', () => null)
  const needsSetup = useState<boolean>('auth:needsSetup', () => false)
  const loaded = useState<boolean>('auth:loaded', () => false)

  async function fetchState(): Promise<AuthState> {
    // useRequestFetch forwards the incoming cookie during SSR so the session is
    // visible on the first server render; on the client it's a plain $fetch.
    const state = await useRequestFetch()<AuthState>('/api/auth/state')
    user.value = state.user
    needsSetup.value = state.needsSetup
    loaded.value = true
    return state
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) await fetchState()
  }

  async function login(username: string, password: string): Promise<void> {
    const res = await $fetch<{ user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })
    user.value = res.user
    needsSetup.value = false
    loaded.value = true
  }

  async function signup(username: string, password: string, email?: string): Promise<void> {
    const res = await $fetch<{ user: PublicUser }>('/api/auth/signup', {
      method: 'POST',
      body: { username, password, email }
    })
    user.value = res.user
    needsSetup.value = false
    loaded.value = true
  }

  async function setup(username: string, password: string, email?: string): Promise<void> {
    const res = await $fetch<{ user: PublicUser }>('/api/auth/setup', {
      method: 'POST',
      body: { username, password, email }
    })
    user.value = res.user
    needsSetup.value = false
    loaded.value = true
  }

  async function logout(): Promise<void> {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  const isAdmin = computed(() => user.value?.role === 'admin')

  return { user, needsSetup, loaded, isAdmin, fetchState, ensureLoaded, login, signup, setup, logout }
}
