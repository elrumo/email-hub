import { sweepInactiveUsers } from '../utils/triggers'

/**
 * Periodic sweep for the inactivity trigger. Runs shortly after boot and
 * every 12 hours after that; sweepInactiveUsers dedupes per inactivity
 * period, so overlapping runs across restarts are harmless.
 */
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return

  const run = async () => {
    try {
      const sent = await sweepInactiveUsers()
      if (sent) console.info(`[triggers] inactivity sweep sent ${sent} email(s)`)
    } catch (e) {
      console.error('[triggers] inactivity sweep failed:', e instanceof Error ? e.message : e)
    }
  }

  setTimeout(run, 60_000)
  setInterval(run, 12 * 60 * 60 * 1000)
})
