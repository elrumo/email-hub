/**
 * The engine's central abstraction. The runner knows ONLY these types — it
 * never imports a specific integration. Adding a new integration (e.g. S3) is
 * a matter of registering one module that satisfies `Integration`.
 */

// ---------------------------------------------------------------------------
// Field schemas — describe a connection's credential fields or an action's
// inputs. The UI renders forms from these; the engine uses them only for
// light validation. Intentionally small (no code, no $ref) to keep flows
// "no-code" and forms trivially generatable.
// ---------------------------------------------------------------------------

export type FieldType = 'string' | 'number' | 'boolean' | 'secret' | 'select' | 'keyValue'

export interface FieldSchema {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** for type: "select" */
  options?: Array<{ label: string, value: string | number }>
  placeholder?: string
  help?: string
  default?: string | number | boolean | Record<string, string>
  /**
   * Conditional visibility: only show/validate this field when another field's
   * current value is one of `in`. Lets one integration present provider-specific
   * fields (e.g. an "AI" connection whose fields depend on the chosen provider)
   * without splitting into multiple integrations. Hidden fields are skipped by
   * the UI and treated as absent by validation.
   */
  showIf?: { field: string, in: Array<string | number | boolean> }
  /**
   * Render this field inside a collapsible "Advanced" section. Purely a UI hint;
   * validation is unaffected.
   */
  advanced?: boolean
}

// ---------------------------------------------------------------------------
// Integration contract
// ---------------------------------------------------------------------------

/** A live, resolved connection passed to action.run / trigger.poll. */
export interface ResolvedConnection {
  id: string
  integrationId: string
  name: string
  config: Record<string, unknown>
}

export interface ActionContext {
  connection: ResolvedConnection | null
  /** input after data-refs ({{ steps.x.y }}) have been resolved */
  input: Record<string, unknown>
  /** structured logging back into the flow_run step record */
  log: (msg: string) => void
  signal: AbortSignal
  /**
   * A live client for stateful integrations (Mongo, Redis, SQL, …), produced by
   * the integration's `client` factory and pooled per connection by the engine.
   * `null` for integrations that declare no factory (e.g. all HTTP integrations,
   * which just `fetch`). Typed `unknown` here — the integration casts it to its
   * own client type inside `run`.
   */
  client: unknown
}

export interface ActionDef {
  id: string
  name: string
  description?: string
  /** if true, this action needs a connection of the parent integration */
  needsConnection?: boolean
  inputSchema: FieldSchema[]
  /** keys this action emits into steps.<stepId>.* — documentation + builder hints */
  outputKeys?: string[]
  run: (ctx: ActionContext) => Promise<Record<string, unknown>>
}

export interface TriggerContext {
  connection: ResolvedConnection | null
  config: Record<string, unknown>
  signal: AbortSignal
}

export interface TriggerDef {
  id: string
  name: string
  description?: string
  /** "cron" | "manual" | "webhook" | "poll" */
  kind: 'cron' | 'manual' | 'webhook' | 'poll'
  needsConnection?: boolean
  configSchema: FieldSchema[]
  /**
   * For poll triggers only: return the event payload if the trigger should
   * fire this tick, or null to skip. Cron/manual/webhook triggers don't
   * implement this — the scheduler/handler produces their payload.
   */
  poll?: (ctx: TriggerContext) => Promise<Record<string, unknown> | null>
}

export interface TestResult {
  ok: boolean
  /** short human message shown in the UI (success detail or error reason) */
  message: string
}

// ---------------------------------------------------------------------------
// Monitoring capability — opt-in for integrations that can be watched on the
// Monitoring page. An integration declares `monitoring` to say "a connection of
// mine can be monitored". Each monitor (a saved connection + a target) is
// snapshotted on demand by running `snapshotAction` with the target config as
// input; the action returns a normalized `MonitorSnapshot`. This keeps the
// page integration-agnostic: it renders whatever snapshot kind comes back.
// ---------------------------------------------------------------------------

/**
 * A normalized point-in-time reading of one monitored target, returned by a
 * monitoring integration's `snapshotAction`. Two shapes:
 *  - "gauges": numeric percentages with progress bars (e.g. Dokploy disk/CPU/mem)
 *  - "status": an up/down/pending/maintenance state (e.g. an Uptime Kuma monitor)
 */
export type MonitorSnapshot
  = | {
    kind: 'gauges'
    /** ordered gauges rendered as labelled progress bars (value is a %, 0–100) */
    gauges: Array<{ key: string, label: string, icon?: string, value: number | null }>
    /** short line shown under the gauges, e.g. "120 GB free" */
    detail?: string
    /** raw payload for the detail view (integration-specific) */
    raw?: unknown
  }
  | {
    kind: 'status'
    /** normalized health state driving the badge colour */
    state: 'up' | 'down' | 'pending' | 'maintenance' | 'unknown'
    /** short human label, e.g. "Up" or "Down" */
    label: string
    detail?: string
    raw?: unknown
  }

export interface MonitoringCapability {
  /**
   * Which snapshot shape this integration produces. Lets the UI lay out the
   * "add monitor" affordance sensibly even before any snapshot is fetched.
   */
  kind: 'gauges' | 'status'
  /**
   * Id of the action (on this same integration) that returns a `MonitorSnapshot`.
   * It receives the monitor's `targetConfig` as `ctx.input` and the resolved
   * connection. Reusing an action keeps fetch logic in one place.
   */
  snapshotAction: string
  /**
   * Fields the user fills per monitor to identify the target (e.g. a Dokploy
   * server, or a Kuma monitor name). Empty = the connection itself is the
   * target. These are exactly the inputs `snapshotAction` consumes.
   */
  targetSchema: FieldSchema[]
}

export interface Integration {
  id: string
  name: string
  /** iconify name, e.g. "i-simple-icons-bunny" */
  icon?: string
  img?: string
  /** fields required to create a connection; empty = no connection needed */
  connectionSchema: FieldSchema[]
  triggers: TriggerDef[]
  actions: ActionDef[]
  /**
   * Optional: a cheap, read-only credential check used by the "Test" button.
   * `config` is the connection's config (possibly unsaved form values, with
   * secrets already merged). Should never mutate anything.
   */
  testConnection?: (config: Record<string, unknown>, signal: AbortSignal) => Promise<TestResult>
  /**
   * Optional: a client factory for stateful integrations (a DB driver, an SDK
   * instance, …). When set, the engine lazily creates ONE client per
   * connection, hands it to every action's `ctx.client`, and tears it down when
   * the connection is idle (or its config changes). HTTP integrations omit this
   * entirely and just `fetch` inside `run`.
   *
   * `connect` receives the resolved connection config; `disconnect` should close
   * sockets/pools cleanly. Both may be async.
   */
  client?: {
    connect: (config: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>
    disconnect: (client: unknown) => Promise<void> | void
    /** ms a client may sit idle before the pool closes it. Default 60_000. */
    idleMs?: number
  }
  /**
   * Optional: opt this integration into the Monitoring page. When set, every
   * connection of this integration can have one or more monitors created
   * against it. See `MonitoringCapability`.
   */
  monitoring?: MonitoringCapability
}

// ---------------------------------------------------------------------------
// Flow definition — the JSON stored in flows.definition
// ---------------------------------------------------------------------------

export type StepType = 'action' | 'condition' | 'forEach' | 'state'

export type Operator
  = | 'eq'
    | 'ne'
    | 'lt'
    | 'lte'
    | 'gt'
    | 'gte'
    | 'contains'
    | 'notContains'
    | 'exists'
    | 'notExists'
    | 'truthy'
    | 'falsy'

/** A single field/operator/value test. `left` is a data-ref string. */
export interface Comparison {
  left: string // e.g. "{{ steps.metrics.status }}" or a literal
  op: Operator
  right?: string | number | boolean // omitted for exists/truthy/etc.
}

/** Condition = AND of comparisons (keep it simple; OR via nested flows later). */
export interface ConditionExpr {
  all: Comparison[]
}

interface BaseStep {
  id: string
  type: StepType
  label?: string
}

export interface ActionStep extends BaseStep {
  type: 'action'
  integrationId: string
  actionId: string
  connectionId?: string | null
  /** raw input; values may contain {{ refs }} resolved at run time */
  input: Record<string, unknown>
  /** optional gate: skip this step unless the condition passes */
  when?: ConditionExpr
}

export interface ConditionStep extends BaseStep {
  type: 'condition'
  expr: ConditionExpr
  /** if the condition fails: "stop" the flow, or "skipRest" remaining, or "continue" (no-op gate used by forEach break) */
  onFail: 'stop' | 'continue'
}

export interface ForEachStep extends BaseStep {
  type: 'forEach'
  /** data-ref to an array, e.g. "{{ steps.list.records }}" */
  items: string
  /** name the current element is exposed under: steps.<as>.item / .index */
  as: string
  steps: FlowStep[]
  /** if set and evaluates true after an iteration, stop looping (break) */
  breakWhen?: ConditionExpr
}

export type StateOp
  = | 'set'
    | 'increment'
    | 'reset'
    | 'stampNow'
    | 'cooldownGate'
    | 'thresholdGate'

export interface StateStep extends BaseStep {
  type: 'state'
  op: StateOp
  /** state key; may contain {{ refs }} to scope per-entity, e.g. "failCount:{{ steps.x.fqdn }}" */
  key: string
  /** for set/increment */
  value?: string | number
  /** cooldownGate: ms window; thresholdGate: count */
  amount?: number
  /**
   * Gate ops (cooldownGate/thresholdGate) behave like a condition: if the gate
   * is NOT satisfied, apply onFail. cooldownGate passes when now-stamp >= amount.
   * thresholdGate passes when the counter >= amount.
   */
  onFail?: 'stop' | 'continue'
}

export type FlowStep
  = | ActionStep
    | ConditionStep
    | ForEachStep
    | StateStep

export interface FlowTrigger {
  integrationId: string
  triggerId: string
  connectionId?: string | null
  config: Record<string, unknown>
  /**
   * denormalized for cron triggers. For schedule modes other than a raw cron
   * (interval/preset), this is the compiled canonical cron string. The config
   * that backs a `core.cron` trigger is a ScheduleConfig (server/engine/schedule.ts):
   * { mode, cron?, intervalMs?, runAt?, timezone?, builder? }.
   */
  cron?: string
}

/**
 * When (if ever) a browser notification fires automatically on a flow run.
 *  - "always"  → every completed run
 *  - "failure" → only when the run errors
 *  - "success" → only when the run succeeds
 * Omitted/"never" disables it. Delivery uses the same Web Push fan-out as the
 * `browser` integration action (server/utils/push.ts).
 */
export type NotifyOnRun = 'never' | 'always' | 'failure' | 'success'

export interface FlowDefinition {
  trigger: FlowTrigger
  steps: FlowStep[]
  /** auto-notify subscribed browsers when this flow runs. Default: never. */
  notifyOnRun?: NotifyOnRun
}

// ---------------------------------------------------------------------------
// Run records
// ---------------------------------------------------------------------------

export interface StepRecord {
  stepId: string
  type: StepType
  label?: string
  status: 'success' | 'error' | 'skipped'
  input?: unknown
  output?: unknown
  error?: string
  logs?: string[]
  /** for forEach: per-iteration child records */
  iterations?: StepRecord[][]
}

export type RunTriggerKind = 'manual' | 'cron' | 'webhook' | 'poll'
