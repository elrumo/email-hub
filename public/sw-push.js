/* eslint-disable */
// Web Push handlers, imported into the generated Workbox service worker via
// `pwa.workbox.importScripts` in nuxt.config.ts. Kept as a plain static file
// (no build step) so it runs in the SW global scope alongside Workbox.
//
// The server (server/utils/push.ts) sends a JSON body of:
//   { title, body, url, tag }

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Flow Hub', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Flow Hub'
  const options = {
    body: data.body || '',
    icon: '/icons/pwa-192x192.png',
    badge: '/icons/pwa-192x192.png',
    tag: data.tag || undefined,
    // re-alert even when a notification with the same tag is already shown
    renotify: !!data.tag,
    data: { url: data.url || '/' }
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is open, otherwise open a new one.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client && url !== '/') client.navigate(url).catch(() => {})
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
