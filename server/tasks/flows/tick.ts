import { schedulerTick } from '../../engine/scheduler'
import { pingMonitorTick } from '../../utils/pingMonitor'

/**
 * The recurring scheduler driver, wrapped as a Nitro task. One run = one
 * scheduler tick: fire every enabled flow whose schedule is due, and advance
 * every constant-ping monitor that's due for a sample. Defined as a task so it
 * gets Nitro's single-instance guarantee (overlapping invocations collapse to
 * one run) and can be triggered manually via runTask / /_nitro/tasks.
 *
 * Driven by the internal interval in server/plugins/engine.ts (reliable on the
 * Bun preset) and, where supported, by nitro `scheduledTasks` cron.
 */
export default defineTask({
  meta: {
    name: 'flows:tick',
    description: 'Run due flows and advance constant-ping monitors'
  },
  async run() {
    const ac = new AbortController()
    const now = Date.now()
    // ping monitors are independent of flows; a failure in one shouldn't skip
    // the other, so run both and surface the first error after.
    const results = await Promise.allSettled([
      schedulerTick(now, ac.signal),
      pingMonitorTick(now, ac.signal)
    ])
    const failed = results.find(r => r.status === 'rejected')
    if (failed && failed.status === 'rejected') throw failed.reason
    return { result: 'ok' }
  }
})
