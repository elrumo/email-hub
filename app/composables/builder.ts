import type { FlowStep, IntegrationMeta } from '~/types'

let counter = 0
export function newStepId(prefix = 'step'): string {
  counter += 1
  return `${prefix}${counter}_${Math.floor(performance.now()) % 100000}`
}

export function blankStep(type: FlowStep['type']): FlowStep {
  const id = newStepId(type)
  switch (type) {
    case 'action':
      return { id, type: 'action', integrationId: '', actionId: '', connectionId: null, input: {} }
    case 'condition':
      return { id, type: 'condition', expr: { all: [{ left: '', op: 'eq', right: '' }] }, onFail: 'stop' }
    case 'forEach':
      return { id, type: 'forEach', items: '', as: 'item', steps: [] }
    case 'state':
      return { id, type: 'state', op: 'increment', key: '' }
  }
}

export const OPERATORS: Array<{ label: string, value: string }> = [
  { label: 'equals', value: 'eq' },
  { label: 'does not equal', value: 'ne' },
  { label: 'is greater than', value: 'gt' },
  { label: 'is at least', value: 'gte' },
  { label: 'is less than', value: 'lt' },
  { label: 'is at most', value: 'lte' },
  { label: 'contains', value: 'contains' },
  { label: 'does not contain', value: 'notContains' },
  { label: 'exists', value: 'exists' },
  { label: 'is empty', value: 'notExists' },
  { label: 'is true', value: 'truthy' },
  { label: 'is false', value: 'falsy' }
]

export const STATE_OPS: Array<{ label: string, value: string, help: string }> = [
  { label: 'Add to a counter', value: 'increment', help: 'Increase a saved number (e.g. failure count).' },
  { label: 'Set a value', value: 'set', help: 'Store a value under a name.' },
  { label: 'Reset a counter', value: 'reset', help: 'Set a saved number back to zero.' },
  { label: 'Record the time now', value: 'stampNow', help: 'Save the current time (used by cooldowns).' },
  { label: 'Only continue if enough time passed (cooldown)', value: 'cooldownGate', help: 'Stop unless N ms elapsed since the saved time.' },
  { label: 'Only continue if a counter is high enough', value: 'thresholdGate', help: 'Stop unless a saved counter ≥ a number.' }
]

/** human label for a step in the list */
export function stepTitle(step: FlowStep, catalog: IntegrationMeta[]): string {
  if (step.label) return step.label
  switch (step.type) {
    case 'action': {
      const integ = catalog.find(i => i.id === step.integrationId)
      const action = integ?.actions.find(a => a.id === step.actionId)
      return action ? `${action.name}` : 'Choose an action'
    }
    case 'condition':
      return 'Only continue if…'
    case 'forEach':
      return 'For each item…'
    case 'state': {
      const op = STATE_OPS.find(o => o.value === step.op)
      return op?.label ?? 'Remember something'
    }
  }
}

/**
 * Per-step-type visual identity for the Siri-Shortcuts-style cards: a coloured,
 * rounded icon tile. `tile` is the icon-badge background/foreground, `ring` the
 * card's hover accent. Kept as static Tailwind class strings so they survive the
 * JIT compiler (no dynamic `bg-${x}` interpolation).
 */
export interface StepAccent { icon: string, tile: string }
const STEP_ACCENTS: Record<FlowStep['type'], StepAccent> = {
  action: { icon: 'i-lucide-zap', tile: 'bg-blue-500 text-white' },
  condition: { icon: 'i-lucide-git-branch', tile: 'bg-amber-500 text-white' },
  forEach: { icon: 'i-lucide-repeat', tile: 'bg-emerald-500 text-white' },
  state: { icon: 'i-lucide-database', tile: 'bg-violet-500 text-white' }
}
export function stepAccent(step: FlowStep): StepAccent {
  return STEP_ACCENTS[step.type] ?? { icon: 'i-lucide-circle', tile: 'bg-gray-500 text-white' }
}

export const STEP_TYPE_OPTIONS = [
  { type: 'action', label: 'Do something', icon: 'i-lucide-zap', help: 'Call a service — Bunny, Dokploy, send a message…' },
  { type: 'condition', label: 'Only continue if…', icon: 'i-lucide-git-branch', help: 'Stop the flow unless a check passes.' },
  { type: 'forEach', label: 'Repeat for each item', icon: 'i-lucide-repeat', help: 'Loop over a list from an earlier step.' },
  { type: 'state', label: 'Remember / cooldown', icon: 'i-lucide-database', help: 'Counters and time-based gates.' }
] as const
