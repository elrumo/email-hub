// Frontend-facing shapes mirroring the API responses. Kept deliberately small;
// the source of truth is server/engine/types.ts.

export type FieldType = 'string' | 'number' | 'boolean' | 'secret' | 'select'

export interface FieldSchema {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: Array<{ label: string, value: string | number }>
  placeholder?: string
  help?: string
  default?: string | number | boolean
}

export interface ActionMeta {
  id: string
  name: string
  description?: string
  needsConnection: boolean
  inputSchema: FieldSchema[]
  outputKeys: string[]
}

export interface TriggerMeta {
  id: string
  name: string
  description?: string
  kind: 'cron' | 'manual' | 'webhook' | 'poll'
  needsConnection: boolean
  configSchema: FieldSchema[]
}

export interface MonitoringCapability {
  kind: 'gauges' | 'status'
  snapshotAction: string
  targetSchema: FieldSchema[]
}

export interface IntegrationMeta {
  id: string
  name: string
  icon?: string
  img?: string
  canTest?: boolean
  monitoring?: MonitoringCapability
  connectionSchema: FieldSchema[]
  triggers: TriggerMeta[]
  actions: ActionMeta[]
}

export interface Connection {
  id: string
  integrationId: string
  name: string
  config: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

/** A saved monitor: one connection + a target, shown on the Monitoring page. */
export interface Monitor {
  id: string
  connectionId: string
  integrationId: string
  name: string
  /** integration-specific target config (secrets redacted), matches the integration's monitoring.targetSchema */
  targetConfig: Record<string, unknown>
  createdAt: number
}

/** Normalized snapshot returned by GET /api/monitors/:id/snapshot (mirrors MonitorSnapshot server-side). */
export type MonitorSnapshot
  = | {
    kind: 'gauges'
    gauges: Array<{ key: string, label: string, icon?: string, value: number | null }>
    detail?: string
    raw?: unknown
  }
  | {
    kind: 'status'
    state: 'up' | 'down' | 'pending' | 'maintenance' | 'unknown'
    label: string
    detail?: string
    raw?: unknown
  }

/** Wrapper around a snapshot fetch: ok=false carries an error reason to show inline. */
export type SnapshotResponse
  = | ({ ok: true } & MonitorSnapshot)
    | { ok: false, error: string }

export type Operator
  = | 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'
    | 'contains' | 'notContains' | 'exists' | 'notExists' | 'truthy' | 'falsy'

export interface Comparison { left: string, op: Operator, right?: string | number | boolean }
export interface ConditionExpr { all: Comparison[] }

export type StepType = 'action' | 'condition' | 'forEach' | 'state'

export interface ActionStep {
  id: string
  type: 'action'
  integrationId: string
  actionId: string
  connectionId?: string | null
  input: Record<string, unknown>
  when?: ConditionExpr
  label?: string
}
export interface ConditionStep { id: string, type: 'condition', expr: ConditionExpr, onFail: 'stop' | 'continue', label?: string }
export interface ForEachStep { id: string, type: 'forEach', items: string, as: string, steps: FlowStep[], breakWhen?: ConditionExpr, label?: string }
export interface StateStep {
  id: string
  type: 'state'
  op: 'set' | 'increment' | 'reset' | 'stampNow' | 'cooldownGate' | 'thresholdGate'
  key: string
  value?: string | number
  amount?: number
  onFail?: 'stop' | 'continue'
  label?: string
}
export type FlowStep = ActionStep | ConditionStep | ForEachStep | StateStep

export interface FlowTrigger {
  integrationId: string
  triggerId: string
  connectionId?: string | null
  config: Record<string, unknown>
  cron?: string
}

export interface FlowDefinition {
  trigger: FlowTrigger
  steps: FlowStep[]
}

export interface Flow {
  id: string
  name: string
  description?: string | null
  enabled: boolean
  definition: FlowDefinition
  cron?: string | null
  lastRunAt?: number | null
  updatedAt: number
}

export interface StepRecord {
  stepId: string
  type: StepType
  label?: string
  status: 'success' | 'error' | 'skipped'
  input?: unknown
  output?: unknown
  error?: string
  logs?: string[]
  iterations?: StepRecord[][]
}

export interface FlowRun {
  id: string
  flowId: string
  trigger: string
  status: 'running' | 'success' | 'error' | 'skipped'
  startedAt: number
  finishedAt?: number | null
  error?: string | null
  steps?: StepRecord[] | null
}
