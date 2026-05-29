import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { flowRuns, flows } from '../db/schema'
import { sendPush } from '../utils/push'
import { runFlow } from './runner'
import type { FlowDefinition, NotifyOnRun, RunTriggerKind } from './types'

export interface ExecuteResult {
  runId: string
  status: 'success' | 'error' | 'skipped'
  error?: string
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
  const db = getDb()
  const rows = await db.select().from(flows).where(eq(flows.id, flowId))
  const flow = rows[0]
  if (!flow) throw new Error(`flow not found: ${flowId}`)

  const runId = randomUUID()
  const startedAt = Date.now()

  await db.insert(flowRuns).values({
    id: runId,
    flowId,
    trigger: triggerKind,
    status: 'running',
    startedAt,
    createdAt: startedAt
  })

  const definition = flow.definition as FlowDefinition
  const result = await runFlow({
    db,
    flowId,
    ownerId: flow.ownerId,
    definition,
    triggerKind,
    triggerPayload,
    now: startedAt,
    signal
  })

  await db
    .update(flowRuns)
    .set({
      status: result.status,
      error: result.error ?? null,
      steps: result.steps,
      finishedAt: Date.now()
    })
    .where(eq(flowRuns.id, runId))

  // bookkeeping for cron de-dup
  await db.update(flows).set({ lastRunAt: startedAt }).where(eq(flows.id, flowId))

  // fire-and-forget browser notification if the flow opted in. Never let a
  // push failure affect the run's recorded outcome.
  if (shouldNotify(definition.notifyOnRun, result.status)) {
    await notifyRun(flow.name, result.status, result.error).catch((e) => {
      console.error('[engine] notify-on-run push failed:', e instanceof Error ? e.message : e)
    })
  }

  return { runId, status: result.status, error: result.error }
}

function shouldNotify(setting: NotifyOnRun | undefined, status: ExecuteResult['status']): boolean {
  switch (setting) {
    case 'always': return true
    case 'failure': return status === 'error'
    case 'success': return status === 'success'
    default: return false
  }
}

async function notifyRun(
  flowName: string,
  status: ExecuteResult['status'],
  error?: string
): Promise<void> {
  const emoji = status === 'error' ? '❌' : status === 'skipped' ? '⏭️' : '✅'
  const body = status === 'error' && error ? error : `Run ${status}`
  await sendPush({
    title: `${emoji} ${flowName}`,
    body,
    url: '/',
    tag: `flow-run` // newer run notifications replace older ones
  })
}
