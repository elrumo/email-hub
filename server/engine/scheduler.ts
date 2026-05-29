import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { flows } from "../db/schema";
import { resolveConnection } from "./connections";
import { cronDue } from "./cron";
import { getTrigger } from "./registry";
import { executeFlow } from "./service";
import type { FlowDefinition } from "./types";

/**
 * One scheduler tick: run every enabled flow whose trigger is due.
 *  - cron triggers: fire when the cron expression matches this minute.
 *  - poll triggers: call the integration's poll(); fire when it returns a payload.
 * Manual/webhook triggers are not handled here (driven by API routes).
 *
 * Errors per-flow are swallowed (logged) so one bad flow can't stall the loop.
 */
export async function schedulerTick(now: number, signal: AbortSignal): Promise<void> {
  const db = getDb();
  const enabled = await db.select().from(flows).where(eq(flows.enabled, true));

  for (const flow of enabled) {
    try {
      const def = flow.definition as FlowDefinition;
      const trig = def?.trigger;
      if (!trig) continue;

      // cron
      if (trig.cron && cronDue(trig.cron, now, flow.lastRunAt)) {
        await executeFlow(flow.id, "cron", { firedAt: now }, signal);
        continue;
      }

      // poll
      const triggerDef = getTrigger(trig.integrationId, trig.triggerId);
      if (triggerDef?.kind === "poll" && triggerDef.poll) {
        const connection = await resolveConnection(db, trig.connectionId);
        const payload = await triggerDef.poll({ connection, config: trig.config || {}, signal });
        if (payload) {
          await executeFlow(flow.id, "poll", payload, signal);
        }
      }
    } catch (e) {
      console.error(`[scheduler] flow ${flow.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
}
