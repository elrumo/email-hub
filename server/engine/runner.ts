import type { DB } from '../db'
import { acquireClient } from './clientPool'
import { resolveConnection } from './connections'
import { evalCondition } from './conditions'
import { resolveObject, resolveValue, type Scope } from './refs'
import { getAction } from './registry'
import { FlowStateStore } from './state'
import type {
  ActionStep,
  ConditionStep,
  FlowDefinition,
  FlowStep,
  ForEachStep,
  RunTriggerKind,
  StateStep,
  StepRecord
} from './types'

export interface RunResult {
  status: 'success' | 'error' | 'skipped'
  error?: string
  steps: StepRecord[]
  /** final scope (for tests / debugging) */
  scope: Scope
}

export interface RunOptions {
  db: DB
  flowId: string
  definition: FlowDefinition
  triggerKind: RunTriggerKind
  triggerPayload: Record<string, unknown>
  now: number
  signal?: AbortSignal
}

/** Sentinel thrown to stop the whole flow early (condition onFail: "stop"). */
class StopFlow extends Error {}

export async function runFlow(opts: RunOptions): Promise<RunResult> {
  const { db, flowId, definition, triggerPayload, now } = opts
  const signal = opts.signal ?? new AbortController().signal
  const state = new FlowStateStore(db, flowId, now)

  const scope: Scope = {
    trigger: triggerPayload || {},
    steps: {}
  }

  const records: StepRecord[] = []

  try {
    await runSteps(definition.steps, { db, scope, state, records, signal })
    const anyError = records.some(r => r.status === 'error')
    return {
      status: anyError ? 'error' : 'success',
      steps: records,
      scope
    }
  } catch (e) {
    if (e instanceof StopFlow) {
      return { status: 'success', steps: records, scope }
    }
    return {
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
      steps: records,
      scope
    }
  }
}

interface ExecCtx {
  db: DB
  scope: Scope
  state: FlowStateStore
  records: StepRecord[]
  signal: AbortSignal
}

async function runSteps(steps: FlowStep[], ctx: ExecCtx): Promise<void> {
  for (const step of steps) {
    if (ctx.signal.aborted) throw new StopFlow('aborted')
    const rec = await runStep(step, ctx)
    ctx.records.push(rec)
  }
}

async function runStep(step: FlowStep, ctx: ExecCtx): Promise<StepRecord> {
  switch (step.type) {
    case 'action':
      return runAction(step, ctx)
    case 'condition':
      return runConditionStep(step, ctx)
    case 'forEach':
      return runForEach(step, ctx)
    case 'state':
      return runStateStep(step, ctx)
    default:
      return {
        stepId: (step as FlowStep).id,
        type: (step as FlowStep).type,
        status: 'error',
        error: `unknown step type: ${(step as { type: string }).type}`
      }
  }
}

async function runAction(step: ActionStep, ctx: ExecCtx): Promise<StepRecord> {
  const base: StepRecord = {
    stepId: step.id,
    type: 'action',
    label: step.label,
    status: 'skipped'
  }

  // optional gate
  if (step.when && !evalCondition(step.when, ctx.scope)) {
    return base
  }

  const action = getAction(step.integrationId, step.actionId)
  if (!action) {
    return { ...base, status: 'error', error: `action not found: ${step.integrationId}.${step.actionId}` }
  }

  const connection = await resolveConnection(ctx.db, step.connectionId)
  if (action.needsConnection && !connection) {
    return { ...base, status: 'error', error: `action ${step.actionId} requires a connection` }
  }

  const input = resolveObject(step.input || {}, ctx.scope)
  const logs: string[] = []

  try {
    // stateful integrations get a pooled client; HTTP ones get null
    const client = connection ? await acquireClient(connection, ctx.signal) : null
    const output = await action.run({
      connection,
      input,
      log: m => logs.push(m),
      signal: ctx.signal,
      client
    });
    // expose output under steps.<stepId>
    (ctx.scope.steps as Record<string, unknown>)[step.id] = output
    return { ...base, status: 'success', input, output, logs }
  } catch (e) {
    return {
      ...base,
      status: 'error',
      input,
      error: e instanceof Error ? e.message : String(e),
      logs
    }
  }
}

async function runConditionStep(step: ConditionStep, ctx: ExecCtx): Promise<StepRecord> {
  const passed = evalCondition(step.expr, ctx.scope)
  const rec: StepRecord = {
    stepId: step.id,
    type: 'condition',
    label: step.label,
    status: 'success',
    output: { passed }
  }
  if (!passed && step.onFail === 'stop') {
    ctx.records.push(rec)
    throw new StopFlow()
  }
  return rec
}

async function runForEach(step: ForEachStep, ctx: ExecCtx): Promise<StepRecord> {
  const rec: StepRecord = {
    stepId: step.id,
    type: 'forEach',
    label: step.label,
    status: 'success',
    iterations: []
  }

  const items = resolveValue(step.items, ctx.scope)
  if (!Array.isArray(items)) {
    return { ...rec, status: 'error', error: `forEach items is not an array: ${step.items}` }
  }

  for (let i = 0; i < items.length; i++) {
    if (ctx.signal.aborted) throw new StopFlow('aborted')
    // expose the loop var under scope[as] = { item, index }
    ctx.scope[step.as] = { item: items[i], index: i }
    const childRecords: StepRecord[] = []
    const childCtx: ExecCtx = { ...ctx, records: childRecords }
    await runSteps(step.steps, childCtx)
    rec.iterations!.push(childRecords)

    if (step.breakWhen && evalCondition(step.breakWhen, ctx.scope)) {
      break
    }
  }
  // clean up loop var (avoid dynamic delete; nulling is enough — refs treat
  // null as "not found")
  ctx.scope[step.as] = undefined

  if (rec.iterations!.flat().some(r => r.status === 'error')) {
    rec.status = 'error'
  }
  return rec
}

async function runStateStep(step: StateStep, ctx: ExecCtx): Promise<StepRecord> {
  const key = String(resolveValue(step.key, ctx.scope))
  const rec: StepRecord = {
    stepId: step.id,
    type: 'state',
    label: step.label,
    status: 'success'
  }

  switch (step.op) {
    case 'set': {
      const v = resolveValue(step.value, ctx.scope)
      await ctx.state.set(key, v)
      rec.output = { key, value: v }
      break
    }
    case 'increment': {
      const by = Number(resolveValue(step.value, ctx.scope) ?? 1) || 1
      const next = await ctx.state.increment(key, by)
      rec.output = { key, value: next }
      break
    }
    case 'reset':
      await ctx.state.reset(key)
      rec.output = { key, value: 0 }
      break
    case 'stampNow':
      await ctx.state.stampNow(key)
      rec.output = { key }
      break
    case 'cooldownGate': {
      const passed = await ctx.state.cooldownPassed(key, step.amount ?? 0)
      rec.output = { key, passed, windowMs: step.amount }
      if (!passed && step.onFail === 'stop') {
        ctx.records.push(rec)
        throw new StopFlow()
      }
      break
    }
    case 'thresholdGate': {
      const passed = await ctx.state.thresholdReached(key, step.amount ?? 0)
      rec.output = { key, passed, threshold: step.amount }
      if (!passed && step.onFail === 'stop') {
        ctx.records.push(rec)
        throw new StopFlow()
      }
      break
    }
    default:
      rec.status = 'error'
      rec.error = `unknown state op: ${(step as { op: string }).op}`
  }

  // expose gate result so later steps can reference it
  (ctx.scope.steps as Record<string, unknown>)[step.id] = rec.output
  return rec
}
