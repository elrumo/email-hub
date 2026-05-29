import type { PingResult, Shortcut } from '~/types'

export type PingState = (PingResult & { pending?: boolean }) | { pending: true }

/**
 * Live liveness-polling for a reactive list of shortcuts. Each ping-enabled
 * shortcut is polled through GET /api/shortcuts/:id/ping every `pingInterval`
 * seconds, but ONLY while the page is mounted and the tab is visible — results
 * are not persisted server-side. Returns a reactive map of shortcutId → state.
 *
 * Pass a getter (ref/computed) so the polled set tracks adds/edits/deletes; the
 * composable reconciles timers whenever the list changes.
 */
export function usePing(shortcuts: MaybeRefOrGetter<Shortcut[]>) {
  const results = reactive<Record<string, PingState | undefined>>({})
  const timers = new Map<string, ReturnType<typeof setInterval>>()
  // guards against overlapping requests when a target is slow
  const inflight = new Set<string>()

  async function pingOnce(s: Shortcut) {
    if (inflight.has(s.id)) return
    inflight.add(s.id)
    if (!results[s.id]) results[s.id] = { pending: true }
    try {
      results[s.id] = await $fetch<PingResult>(`/api/shortcuts/${s.id}/ping`)
    } catch {
      results[s.id] = { ok: false, status: null, latency: 0, error: 'check failed', checkedAt: Date.now() }
    } finally {
      inflight.delete(s.id)
    }
  }

  function clearTimer(id: string) {
    const t = timers.get(id)
    if (t) {
      clearInterval(t)
      timers.delete(id)
    }
  }

  function reconcile() {
    if (import.meta.server) return
    const list = toValue(shortcuts)
    const active = new Set<string>()

    for (const s of list) {
      if (!s.pingEnabled) {
        clearTimer(s.id)
        continue
      }
      active.add(s.id)
      // (re)arm the timer at the shortcut's interval; ping immediately too
      clearTimer(s.id)
      pingOnce(s)
      timers.set(s.id, setInterval(() => {
        if (document.visibilityState === 'visible') pingOnce(s)
      }, s.pingInterval * 1000))
    }

    // tear down timers for shortcuts that vanished or lost ping
    for (const id of [...timers.keys()]) {
      if (!active.has(id)) clearTimer(id)
    }
    // drop stale results in one reassignment (avoids per-key dynamic delete)
    for (const id of Object.keys(results)) {
      if (!active.has(id)) results[id] = undefined
    }
  }

  // re-ping everything when the tab regains focus so stale tabs refresh fast
  function onVisible() {
    if (document.visibilityState !== 'visible') return
    for (const s of toValue(shortcuts)) {
      if (s.pingEnabled) pingOnce(s)
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisible)
    reconcile()
  })
  watch(() => toValue(shortcuts), reconcile, { deep: true })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible)
    for (const id of [...timers.keys()]) clearTimer(id)
  })

  return { results }
}
