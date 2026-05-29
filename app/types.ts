// Frontend-facing shapes mirroring the API responses. Kept deliberately small;
// the source of truth is server/engine/types.ts.

export type FieldType = 'string' | 'number' | 'boolean' | 'secret' | 'select' | 'keyValue'

export interface FieldSchema {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: Array<{ label: string, value: string | number, icon?: string, img?: string }>
  placeholder?: string
  help?: string
  default?: string | number | boolean | Record<string, string>
  /** only show/validate when another field's value is one of `in` */
  showIf?: { field: string, in: Array<string | number | boolean> }
  /** render inside a collapsible "Advanced" section */
  advanced?: boolean
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

/** A labelled link, optionally pingable for liveness while a page is open. */
export interface Shortcut {
  id: string
  name: string
  url: string
  icon?: string | null
  pingEnabled: boolean
  /** separate URL to ping; falls back to `url` when null */
  pingUrl?: string | null
  /** seconds between pings */
  pingInterval: number
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/** Result of GET /api/shortcuts/:id/ping — a live, non-persisted liveness check. */
export interface PingResult {
  ok: boolean
  status: number | null
  latency: number
  error?: string
  checkedAt: number
}

export type WidgetKind = 'shortcut' | 'flow' | 'monitor' | 'note'

/** A tile on the home bento grid. See server/db/schema.ts `widgets`. */
export interface Widget {
  id: string
  kind: WidgetKind
  /** id of the referenced shortcut/flow/monitor, or null for notes */
  refId?: string | null
  /** markdown body for note tiles */
  content?: string | null
  /** column span (1–4) */
  w: number
  /** row span (1–4) */
  h: number
  sortOrder: number
  createdAt: number
  updatedAt: number
}

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

export type ScheduleMode = 'cron' | 'interval' | 'at'

/** Shape of `config` for a `core.cron` trigger (mirrors server schedule.ts). */
export interface ScheduleConfig {
  mode?: ScheduleMode
  cron?: string
  intervalMs?: number
  runAt?: number
  timezone?: string | null
  /** verbatim friendly-UI inputs so the builder can reconstruct itself */
  builder?: ScheduleBuilderState
  [key: string]: unknown
}

/** The friendly schedule-builder's UI state, persisted in config.builder. */
export interface ScheduleBuilderState {
  mode: ScheduleMode
  /** preset key for recurring mode: 'minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'advanced' */
  preset?: string
  intervalEvery?: number
  intervalUnit?: 'minutes' | 'hours'
  timeOfDay?: string
  weekdays?: number[]
  dayOfMonth?: number
  atLocal?: string
  cron?: string
  timezone?: string | null
}

export interface FlowTrigger {
  integrationId: string
  triggerId: string
  connectionId?: string | null
  config: Record<string, unknown>
  cron?: string
}

export type NotifyOnRun = 'never' | 'always' | 'failure' | 'success'

export interface FlowDefinition {
  trigger: FlowTrigger
  steps: FlowStep[]
  notifyOnRun?: NotifyOnRun
}

export interface Flow {
  id: string
  name: string
  description?: string | null
  enabled: boolean
  definition: FlowDefinition
  cron?: string | null
  runAt?: number | null
  timezone?: string | null
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
