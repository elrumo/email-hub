import { schedulerTick } from '../../engine/scheduler'

/**
 * The recurring scheduler driver, wrapped as a Nitro task. One run = one
 * scheduler tick (fire every enabled flow whose schedule is due). Defined as a
 * task so it gets Nitro's single-instance guarantee (overlapping invocations
 * collapse to one run) and can be triggered manually via runTask / /_nitro/tasks.
 *
 * Driven by the internal interval in server/plugins/engine.ts (reliable on the
 * Bun preset) and, where supported, by nitro `scheduledTasks` cron.
 */
export default defineTask({
  meta: {
    name: 'flows:tick',
    description: 'Run every enabled flow whose schedule is due'
  },
  async run() {
    const ac = new AbortController()
    await schedulerTick(Date.now(), ac.signal)
    return { result: 'ok' }
  }
})
