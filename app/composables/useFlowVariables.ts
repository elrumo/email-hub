import type { FlowStep, FlowTrigger, IntegrationMeta } from '~/types'
import { stepTitle } from '~/composables/builder'

/**
 * A single referenceable value in a flow — the "magic variables" surfaced in
 * the builder. `ref` is the literal you paste into a field ({{ … }}); the rest
 * is presentation. Modelled after Apple Shortcuts, where every action's output
 * becomes a variable later steps can use.
 */
export interface FlowVariable {
  ref: string
  /** short name of the value, e.g. "status" */
  name: string
  /** where it comes from, e.g. "Trigger" or a step's title */
  source: string
  icon: string
  group: 'trigger' | 'step' | 'loop' | 'state'
}

export interface FlowVariableGroup {
  key: string
  label: string
  icon: string
  vars: FlowVariable[]
}

/**
 * Collect the variables available *before* a given step index (or all of them
 * when `upTo` is omitted). Pulls the trigger's declared output keys, each
 * earlier action step's output keys, any state keys set/incremented, and the
 * loop variables of enclosing forEach steps.
 */
export function collectFlowVariables(
  catalog: IntegrationMeta[],
  trigger: FlowTrigger,
  steps: FlowStep[],
  upTo: number = steps.length
): FlowVariableGroup[] {
  const triggerVars: FlowVariable[] = []
  const stepVars: FlowVariable[] = []
  const loopVars: FlowVariable[] = []
  const stateVars: FlowVariable[] = []

  // --- trigger ---
  const integ = catalog.find(i => i.id === trigger.integrationId)
  const trig = integ?.triggers.find(t => t.id === trigger.triggerId)
  const triggerKeys = trig?.outputKeys ?? []
  if (triggerKeys.length) {
    for (const k of triggerKeys) {
      triggerVars.push({ ref: `{{ trigger.${k} }}`, name: k, source: trig?.name ?? 'Trigger', icon: 'i-lucide-zap', group: 'trigger' })
    }
  } else {
    triggerVars.push({ ref: '{{ trigger }}', name: 'trigger', source: 'Trigger payload', icon: 'i-lucide-zap', group: 'trigger' })
  }

  // --- steps (only those that come before `upTo`) ---
  for (let i = 0; i < Math.min(upTo, steps.length); i++) {
    const s = steps[i]!
    if (s.type === 'action') {
      const ai = catalog.find(c => c.id === s.integrationId)
      const action = ai?.actions.find(a => a.id === s.actionId)
      const title = stepTitle(s, catalog)
      for (const k of action?.outputKeys ?? []) {
        stepVars.push({ ref: `{{ steps.${s.id}.${k} }}`, name: k, source: title, icon: 'i-lucide-zap', group: 'step' })
      }
    } else if (s.type === 'forEach') {
      const as = s.as || 'item'
      loopVars.push({ ref: `{{ ${as}.item }}`, name: `${as}.item`, source: 'For each item', icon: 'i-lucide-repeat', group: 'loop' })
      loopVars.push({ ref: `{{ ${as}.index }}`, name: `${as}.index`, source: 'For each item', icon: 'i-lucide-repeat', group: 'loop' })
    } else if (s.type === 'state' && (s.op === 'set' || s.op === 'increment') && s.key) {
      stateVars.push({ ref: `{{ state.${s.key} }}`, name: s.key, source: 'Saved value', icon: 'i-lucide-database', group: 'state' })
    }
  }

  return [
    { key: 'trigger', label: 'From the trigger', icon: 'i-lucide-bolt', vars: triggerVars },
    { key: 'step', label: 'From earlier steps', icon: 'i-lucide-zap', vars: stepVars },
    { key: 'loop', label: 'Loop variables', icon: 'i-lucide-repeat', vars: loopVars },
    { key: 'state', label: 'Saved values', icon: 'i-lucide-database', vars: stateVars }
  ].filter(g => g.vars.length > 0)
}
