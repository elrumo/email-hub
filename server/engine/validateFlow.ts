import { getAction, getTrigger } from './registry'
import { compileSchedule, type ScheduleConfig } from './schedule'
import type { FlowDefinition, FlowStep } from './types'

export interface FlowValidation {
  ok: boolean
  error?: string
  /** denormalized canonical cron string (recurring schedules); null otherwise */
  cron: string | null
  /** denormalized epoch ms for one-time ("at") schedules; null otherwise */
  runAt: number | null
  /** IANA timezone the schedule is evaluated in; null = server-local */
  timezone: string | null
}

const fail = (error: string): FlowValidation => ({ ok: false, error, cron: null, runAt: null, timezone: null })

/**
 * Structural validation of a flow definition: the trigger + every action step
 * must reference integrations/actions/triggers that actually exist in the
 * registry. For a cron trigger it also compiles the schedule config into the
 * denormalized { cron, runAt, timezone } the scheduler reads.
 */
export function validateFlowDefinition(def: unknown): FlowValidation {
  if (!def || typeof def !== 'object') return fail('definition must be an object')
  const d = def as FlowDefinition

  if (!d.trigger || typeof d.trigger !== 'object') {
    return fail('flow must have a trigger')
  }
  const trig = getTrigger(d.trigger.integrationId, d.trigger.triggerId)
  // "manual"/"webhook" can be built-in pseudo-triggers not tied to an integration
  const isCron = d.trigger.integrationId === 'core' && d.trigger.triggerId === 'cron'
  const isBuiltinTrigger
    = d.trigger.integrationId === 'core'
      && (d.trigger.triggerId === 'manual' || d.trigger.triggerId === 'webhook' || isCron)
  if (!trig && !isBuiltinTrigger) {
    return fail(`unknown trigger: ${d.trigger.integrationId}.${d.trigger.triggerId}`)
  }

  if (!Array.isArray(d.steps)) return fail('steps must be an array')

  const stepErr = validateSteps(d.steps)
  if (stepErr) return fail(stepErr)

  if (isCron) {
    // The cron trigger's config is a ScheduleConfig. Fall back to a bare
    // trigger.cron for flows authored before the schedule builder existed.
    const cfg = (d.trigger.config ?? {}) as ScheduleConfig
    const effective: ScheduleConfig = cfg.mode || cfg.cron || cfg.runAt != null
      ? cfg
      : { mode: 'cron', cron: d.trigger.cron }
    const compiled = compileSchedule(effective)
    if (compiled.error) return fail(compiled.error)
    return { ok: true, cron: compiled.cron, runAt: compiled.runAt, timezone: compiled.timezone }
  }

  return { ok: true, cron: null, runAt: null, timezone: null }
}

function validateSteps(steps: FlowStep[]): string | null {
  for (const step of steps) {
    if (!step.id) return 'every step needs an id'
    switch (step.type) {
      case 'action': {
        if (!getAction(step.integrationId, step.actionId)) {
          return `unknown action: ${step.integrationId}.${step.actionId}`
        }
        break
      }
      case 'forEach': {
        const inner = validateSteps(step.steps ?? [])
        if (inner) return inner
        break
      }
      case 'condition':
      case 'state':
        break
      default:
        return `unknown step type: ${(step as { type: string }).type}`
    }
  }
  return null
}
