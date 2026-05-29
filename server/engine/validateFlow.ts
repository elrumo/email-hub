import { getAction, getTrigger } from './registry'
import type { FlowDefinition, FlowStep } from './types'

export interface FlowValidation {
  ok: boolean
  error?: string
  cron: string | null
}

/**
 * Structural validation of a flow definition: the trigger + every action step
 * must reference integrations/actions/triggers that actually exist in the
 * registry. Returns the denormalized cron expression (for the scheduler) when
 * the trigger is a cron trigger.
 */
export function validateFlowDefinition(def: unknown): FlowValidation {
  if (!def || typeof def !== 'object') return { ok: false, error: 'definition must be an object', cron: null }
  const d = def as FlowDefinition

  if (!d.trigger || typeof d.trigger !== 'object') {
    return { ok: false, error: 'flow must have a trigger', cron: null }
  }
  const trig = getTrigger(d.trigger.integrationId, d.trigger.triggerId)
  // "manual"/"webhook" can be built-in pseudo-triggers not tied to an integration
  const isBuiltinTrigger
    = d.trigger.integrationId === 'core'
      && (d.trigger.triggerId === 'manual' || d.trigger.triggerId === 'webhook' || d.trigger.triggerId === 'cron')
  if (!trig && !isBuiltinTrigger) {
    return { ok: false, error: `unknown trigger: ${d.trigger.integrationId}.${d.trigger.triggerId}`, cron: null }
  }

  if (!Array.isArray(d.steps)) return { ok: false, error: 'steps must be an array', cron: null }

  const stepErr = validateSteps(d.steps)
  if (stepErr) return { ok: false, error: stepErr, cron: null }

  const cron = typeof d.trigger.cron === 'string' && d.trigger.cron.trim() ? d.trigger.cron.trim() : null
  return { ok: true, cron }
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
