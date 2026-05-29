/**
 * iOS PWAs added to the home screen via `apple-mobile-web-app-capable` do not
 * reliably match the `display-mode: standalone` media query, so any safe-area
 * CSS keyed off that query never applies — and the app header ends up rendered
 * underneath the translucent iOS status bar / notch.
 *
 * Detect standalone mode at runtime instead: iOS exposes the non-standard
 * `navigator.standalone`, while every other platform answers the media query.
 * We toggle a `.pwa-standalone` class on <html> that the CSS can target to
 * reserve `env(safe-area-inset-top)` on the header.
 */
export default defineNuxtPlugin(() => {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const mql = window.matchMedia('(display-mode: standalone)')

  const apply = () => {
    const standalone = nav.standalone === true || mql.matches
    document.documentElement.classList.toggle('pwa-standalone', standalone)
  }

  apply()
  // Display mode can change without a reload (e.g. installing the PWA).
  mql.addEventListener?.('change', apply)
})
