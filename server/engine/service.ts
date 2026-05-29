import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { flowRuns, flows } from "../db/schema";
import { runFlow } from "./runner";
import type { FlowDefinition, RunTriggerKind } from "./types";

export interface ExecuteResult {
  runId: string;
  status: "success" | "error" | "skipped";
  error?: string;
}

/**
 * Execute a flow by id and persist a flow_run. `triggerPayload` is exposed to
 * the flow as {{ trigger.* }}. Records are written even on error so the UI can
 * show what happened.
 */
export async function executeFlow(
  flowId: string,
  triggerKind: RunTriggerKind,
  triggerPayload: Record<string, unknown> = {},
  signal?: AbortSignal
): Promise<ExecuteResult> {
  const db = getDb();
  const rows = await db.select().from(flows).where(eq(flows.id, flowId));
  const flow = rows[0];
  if (!flow) throw new Error(`flow not found: ${flowId}`);

  const runId = randomUUID();
  const startedAt = Date.now();

  await db.insert(flowRuns).values({
    id: runId,
    flowId,
    trigger: triggerKind,
    status: "running",
    startedAt,
    createdAt: startedAt
  });

  const definition = flow.definition as FlowDefinition;
  const result = await runFlow({
    db,
    flowId,
    definition,
    triggerKind,
    triggerPayload,
    now: startedAt,
    signal
  });

  await db
    .update(flowRuns)
    .set({
      status: result.status,
      error: result.error ?? null,
      steps: result.steps,
      finishedAt: Date.now()
    })
    .where(eq(flowRuns.id, runId));

  // bookkeeping for cron de-dup
  await db.update(flows).set({ lastRunAt: startedAt }).where(eq(flows.id, flowId));

  return { runId, status: result.status, error: result.error };
}
