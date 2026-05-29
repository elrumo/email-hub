import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { flows } from '../db/schema'
import { resolveConnection } from './connections'
import { cronDue } from './cron'
import { getTrigger } from './registry'
import { executeFlow } from './service'
import type { FlowDefinition } from './types'

/**
 * One scheduler tick: run every enabled flow whose trigger is due.
 *  - one-time ("at") schedules: fire once when now passes runAt, then disable.
 *  - cron triggers: fire when the cron expression matches this minute (in the
 *    flow's timezone, if set).
 *  - poll triggers: call the integration's poll(); fire when it returns a payload.
 * Manual/webhook triggers are not handled here (driven by API routes).
 *
 * Errors per-flow are swallowed (logged) so one bad flow can't stall the loop.
 */
export async function schedulerTick(now: number, signal: AbortSignal): Promise<void> {
  const db = getDb()
  const enabled = await db.select().from(flows).where(eq(flows.enabled, true))

  for (const flow of enabled) {
    try {
      const def = flow.definition as FlowDefinition
      const trig = def?.trigger
      if (!trig) continue

      // one-time "at": fire once when due, then disable so it never repeats.
      // lastRunAt guards against a double-fire within the same tick window.
      if (flow.runAt != null) {
        if (now >= flow.runAt && flow.lastRunAt == null) {
          await executeFlow(flow.id, 'cron', { firedAt: now, scheduledAt: flow.runAt }, signal)
          await db.update(flows).set({ enabled: false }).where(eq(flows.id, flow.id))
          console.log(`[scheduler] one-time flow ${flow.id} fired and disabled`)
        }
        continue
      }

      // cron (evaluated in the flow's timezone when one is set)
      if (flow.cron && cronDue(flow.cron, now, flow.lastRunAt, flow.timezone)) {
        await executeFlow(flow.id, 'cron', { firedAt: now }, signal)
        continue
      }

      // poll
      const triggerDef = getTrigger(trig.integrationId, trig.triggerId)
      if (triggerDef?.kind === 'poll' && triggerDef.poll) {
        const connection = await resolveConnection(db, trig.connectionId, flow.ownerId)
        const payload = await triggerDef.poll({ connection, config: trig.config || {}, signal })
        if (payload) {
          await executeFlow(flow.id, 'poll', payload, signal)
        }
      }
    } catch (e) {
      console.error(`[scheduler] flow ${flow.id} failed:`, e instanceof Error ? e.message : e)
    }
  }
}
