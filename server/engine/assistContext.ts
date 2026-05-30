import type { DiscoveredKumaMonitor } from '../integrations/kuma'

export interface AssistOption {
  label: string
  value: string | number
}

export type AssistQuestionKind = 'select' | 'multiselect' | 'boolean' | 'text' | 'number'

export interface AssistQuestion {
  id: string
  label: string
  kind: AssistQuestionKind
  options: AssistOption[]
  required?: boolean
  help?: string
}

const QUESTION_KINDS: AssistQuestionKind[] = ['select', 'multiselect', 'boolean', 'text', 'number']

export interface AssistConnectionContext {
  id: string
  name: string
  integrationId: string
  integrationName: string
}

export interface AssistDiscoveryContext {
  integrationId: string
  connectionId: string
  connectionName: string
  fieldKey: string
  label: string
  options: AssistOption[]
}

export interface AssistContext {
  connections: AssistConnectionContext[]
  discoveries: AssistDiscoveryContext[]
}

function truncateOptions(options: AssistOption[], max = 50): AssistOption[] {
  return options.slice(0, max)
}

export function kumaDiscovery(
  connection: AssistConnectionContext,
  monitors: DiscoveredKumaMonitor[]
): AssistDiscoveryContext {
  return {
    integrationId: 'kuma',
    connectionId: connection.id,
    connectionName: connection.name,
    fieldKey: 'monitor',
    label: 'Uptime Kuma monitor',
    options: truncateOptions(monitors.map(m => ({
      label: m.group ? `${m.group} / ${m.name}` : m.name,
      value: m.name
    })))
  }
}

export function bunnyZoneDiscovery(
  connection: AssistConnectionContext,
  zones: Array<{ id: number, domain: string }>
): AssistDiscoveryContext {
  return {
    integrationId: 'bunny',
    connectionId: connection.id,
    connectionName: connection.name,
    fieldKey: 'zoneId',
    label: 'Bunny DNS zone',
    options: truncateOptions(zones.map(z => ({
      label: `${z.domain} (${z.id})`,
      value: z.id
    })))
  }
}

export function formatAssistContext(context: AssistContext): string {
  if (!context.connections.length && !context.discoveries.length) {
    return 'No saved user connections or discovered selectable values are available yet.'
  }

  return JSON.stringify(context, null, 2)
}

export function normalizeAssistQuestions(raw: unknown): Array<string | AssistQuestion> {
  if (!Array.isArray(raw)) return []

  return raw
    .map((q): string | AssistQuestion | null => {
      if (typeof q === 'string') return q
      if (!q || typeof q !== 'object') return null

      const obj = q as Record<string, unknown>
      const label = typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim() : ''

      let options = Array.isArray(obj.options)
        ? obj.options
            .map((opt): AssistOption | null => {
              if (!opt || typeof opt !== 'object') return null
              const option = opt as Record<string, unknown>
              const value = option.value
              if (typeof value !== 'string' && typeof value !== 'number') return null
              const optLabel = typeof option.label === 'string' ? option.label : String(value)
              return { label: optLabel, value }
            })
            .filter((opt): opt is AssistOption => !!opt)
        : []

      const requestedKind = typeof obj.kind === 'string' ? obj.kind as AssistQuestionKind : undefined
      const kind: AssistQuestionKind = requestedKind && QUESTION_KINDS.includes(requestedKind)
        ? requestedKind
        : (options.length ? 'select' : 'text')

      // choice kinds need options; if none were supplied, degrade to a plain
      // open-ended (string) question rather than rendering an empty control
      if ((kind === 'select' || kind === 'multiselect') && !options.length) {
        return label || null
      }
      if (kind === 'boolean' && !options.length) {
        options = [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]
      }

      return {
        id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : 'choice',
        label: label || 'Choose an option',
        kind,
        options,
        required: obj.required !== false,
        help: typeof obj.help === 'string' ? obj.help : undefined
      }
    })
    .filter((q): q is string | AssistQuestion => !!q)
}
