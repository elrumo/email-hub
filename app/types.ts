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
  kind: 'gauges' | 'status' | 'stats'
  snapshotAction: string
  targetSchema: FieldSchema[]
}

/** A public-safe analytics `<script>` tag injected on a tracked public board. */
export interface AnalyticsScriptTag {
  src?: string
  async?: boolean
  defer?: boolean
  innerHTML?: string
  attrs?: Record<string, string>
}

export interface IntegrationMeta {
  id: string
  name: string
  icon?: string
  img?: string
  canTest?: boolean
  monitoring?: MonitoringCapability
  /** true when the integration can track public boards (Plausible / GA) */
  webAnalytics?: boolean
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
  /** allow the live snapshot to appear on public boards */
  publicVisible: boolean
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
  | {
    kind: 'stats'
    stats: Array<{ key: string, label: string, icon?: string, value: number | string | null, unit?: string, hint?: string }>
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

export type WidgetKind = 'shortcut' | 'flow' | 'monitor' | 'note' | 'section' | 'image' | 'iframe'

/** Per-tile card chrome on the bento grid. */
export type CardStyle = 'shadow' | 'outline' | 'none'

/** A tile on the home bento grid. See server/db/schema.ts `widgets`. */
export interface Widget {
  id: string
  kind: WidgetKind
  /** id of the referenced shortcut/flow/monitor, or null for note/section */
  refId?: string | null
  /** rich text (note), title (section), or URL (image/iframe src); null for reference tiles */
  content?: string | null
  /** card chrome — soft shadow, outline ring, or none */
  cardStyle?: CardStyle
  /** column span (1–4) */
  w: number
  /** row span (1–4) */
  h: number
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/** A home grid. See server/db/schema.ts `boards`. */
export interface Board {
  id: string
  name: string
  /** url-safe unique id used for the public /b/<slug> view */
  slug: string
  /** the board the home page opens on (one per user) */
  isDefault: boolean
  /** viewable read-only by unauthenticated visitors */
  isPublic: boolean
  /** allow public visitors to run every flow on this board (overrides per-flow flag) */
  publicTrigger: boolean
  /** connection used to track visits to this board (Plausible / Google Analytics), or null */
  analyticsConnectionId?: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/** Shape returned by the public board endpoint (display-only, no secrets). */
export interface PublicBoard {
  board: { id: string, name: string, slug: string, publicTrigger: boolean }
  /** public-safe analytics script tags to inject on the board page (may be empty) */
  analytics?: { tags: AnalyticsScriptTag[] }
  widgets: Array<Pick<Widget, 'id' | 'kind' | 'refId' | 'content' | 'cardStyle' | 'w' | 'h' | 'sortOrder'>>
  shortcuts: Array<{ id: string, name: string, url: string, icon?: string | null }>
  flows: Array<{ id: string, name: string, description?: string | null, enabled: boolean, canTrigger: boolean }>
  monitors: Array<{ id: string, name: string, integrationId: string, publicVisible: boolean }>
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

export interface FlowDraft {
  name: string
  description?: string | null
  enabled?: boolean
  /** allow unauthenticated visitors of a public board to run this flow */
  publicTrigger?: boolean
  definition: FlowDefinition
}

export interface Flow {
  id: string
  name: string
  description?: string | null
  enabled: boolean
  /** allow unauthenticated visitors of a public board to run this flow */
  publicTrigger?: boolean
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

// ---------------------------------------------------------------------------
// Accounts, sessions and stats (multi-user)
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'user'

/** A user shape safe for the client (mirrors server PublicUser — no hash). */
export interface PublicUser {
  id: string
  username: string
  email: string | null
  role: UserRole
  lastLoginAt: number | null
  createdAt: number
}

/** GET /api/auth/state — drives the login/setup/app routing decision. */
export interface AuthState {
  needsSetup: boolean
  user: PublicUser | null
}

/** GET /api/me/stats and the per-user block of the admin overview. */
export interface UserStats {
  flowsCreated: number
  connectionsCount: number
  monitorsCount: number
  shortcutsCount: number
  flowRunsTotal: number
  flowRunSuccess: number
  flowRunError: number
  lastFlowRunAt: number | null
}

/** One row in GET /api/me/activity. */
export interface ActivityEntry {
  id: string
  userId: string
  action: string
  entityType: string | null
  entityId: string | null
  detail: Record<string, unknown> | null
  createdAt: number
}

/** One row in GET /api/admin/users — a user plus their aggregate stats. */
export interface AdminUserSummary extends PublicUser {
  stats: UserStats
}

/** GET /api/admin/stats — instance-wide totals. */
export interface AdminStats {
  users: number
  flows: number
  connections: number
  monitors: number
  flowRuns: number
}
