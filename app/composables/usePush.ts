/**
 * Browser Web Push subscription state for the current device. Drives the bell
 * toggle in the header: read `supported`/`enabled`/`permission`, call
 * `enable()` / `disable()` / `sendTest()`. All server talk goes through the
 * /api/push/* endpoints; the service worker (registered by @vite-pwa/nuxt)
 * receives the pushes via public/sw-push.js.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function usePush() {
  // shared across components within the app
  const supported = useState('push:supported', () => false)
  const enabled = useState('push:enabled', () => false)
  const permission = useState<NotificationPermission>('push:permission', () => 'default')
  const busy = useState('push:busy', () => false)

  async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null
    return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready)
  }

  /** Read current state on mount: is push supported, and are we already subscribed? */
  async function refresh() {
    if (import.meta.server) return
    supported.value = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!supported.value) return
    permission.value = Notification.permission
    const reg = await getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    enabled.value = !!sub
  }

  async function enable(): Promise<{ ok: boolean, message?: string }> {
    if (!supported.value) return { ok: false, message: 'This browser does not support notifications.' }
    busy.value = true
    try {
      const perm = await Notification.requestPermission()
      permission.value = perm
      if (perm !== 'granted') {
        return { ok: false, message: 'Notification permission was denied.' }
      }

      const reg = await getRegistration()
      if (!reg) return { ok: false, message: 'Service worker is not ready yet — reload and try again.' }

      const { publicKey } = await $fetch<{ publicKey: string }>('/api/push/public-key')
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
      })

      await $fetch('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } })
      enabled.value = true
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not enable notifications.' }
    } finally {
      busy.value = false
    }
  }

  async function disable(): Promise<{ ok: boolean }> {
    busy.value = true
    try {
      const reg = await getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await $fetch('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {})
        await sub.unsubscribe().catch(() => {})
      }
      enabled.value = false
      return { ok: true }
    } finally {
      busy.value = false
    }
  }

  async function sendTest(): Promise<{ sent: number }> {
    return await $fetch<{ sent: number }>('/api/push/test', { method: 'POST' })
  }

  return { supported, enabled, permission, busy, refresh, enable, disable, sendTest }
}
