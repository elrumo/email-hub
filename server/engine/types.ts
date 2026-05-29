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

export type FieldType = "string" | "number" | "boolean" | "secret" | "select";

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** for type: "select" */
  options?: Array<{ label: string; value: string | number }>;
  placeholder?: string;
  help?: string;
  default?: string | number | boolean;
}

// ---------------------------------------------------------------------------
// Integration contract
// ---------------------------------------------------------------------------

/** A live, resolved connection passed to action.run / trigger.poll. */
export interface ResolvedConnection {
  id: string;
  integrationId: string;
  name: string;
  config: Record<string, unknown>;
}

export interface ActionContext {
  connection: ResolvedConnection | null;
  /** input after data-refs ({{ steps.x.y }}) have been resolved */
  input: Record<string, unknown>;
  /** structured logging back into the flow_run step record */
  log: (msg: string) => void;
  signal: AbortSignal;
}

export interface ActionDef {
  id: string;
  name: string;
  description?: string;
  /** if true, this action needs a connection of the parent integration */
  needsConnection?: boolean;
  inputSchema: FieldSchema[];
  /** keys this action emits into steps.<stepId>.* — documentation + builder hints */
  outputKeys?: string[];
  run: (ctx: ActionContext) => Promise<Record<string, unknown>>;
}

export interface TriggerContext {
  connection: ResolvedConnection | null;
  config: Record<string, unknown>;
  signal: AbortSignal;
}

export interface TriggerDef {
  id: string;
  name: string;
  description?: string;
  /** "cron" | "manual" | "webhook" | "poll" */
  kind: "cron" | "manual" | "webhook" | "poll";
  needsConnection?: boolean;
  configSchema: FieldSchema[];
  /**
   * For poll triggers only: return the event payload if the trigger should
   * fire this tick, or null to skip. Cron/manual/webhook triggers don't
   * implement this — the scheduler/handler produces their payload.
   */
  poll?: (ctx: TriggerContext) => Promise<Record<string, unknown> | null>;
}

export interface Integration {
  id: string;
  name: string;
  /** iconify name, e.g. "i-simple-icons-bunny" */
  icon?: string;
  /** fields required to create a connection; empty = no connection needed */
  connectionSchema: FieldSchema[];
  triggers: TriggerDef[];
  actions: ActionDef[];
}

// ---------------------------------------------------------------------------
// Flow definition — the JSON stored in flows.definition
// ---------------------------------------------------------------------------

export type StepType = "action" | "condition" | "forEach" | "state";

export type Operator =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "notContains"
  | "exists"
  | "notExists"
  | "truthy"
  | "falsy";

/** A single field/operator/value test. `left` is a data-ref string. */
export interface Comparison {
  left: string; // e.g. "{{ steps.metrics.status }}" or a literal
  op: Operator;
  right?: string | number | boolean; // omitted for exists/truthy/etc.
}

/** Condition = AND of comparisons (keep it simple; OR via nested flows later). */
export interface ConditionExpr {
  all: Comparison[];
}

interface BaseStep {
  id: string;
  type: StepType;
  label?: string;
}

export interface ActionStep extends BaseStep {
  type: "action";
  integrationId: string;
  actionId: string;
  connectionId?: string | null;
  /** raw input; values may contain {{ refs }} resolved at run time */
  input: Record<string, unknown>;
  /** optional gate: skip this step unless the condition passes */
  when?: ConditionExpr;
}

export interface ConditionStep extends BaseStep {
  type: "condition";
  expr: ConditionExpr;
  /** if the condition fails: "stop" the flow, or "skipRest" remaining, or "continue" (no-op gate used by forEach break) */
  onFail: "stop" | "continue";
}

export interface ForEachStep extends BaseStep {
  type: "forEach";
  /** data-ref to an array, e.g. "{{ steps.list.records }}" */
  items: string;
  /** name the current element is exposed under: steps.<as>.item / .index */
  as: string;
  steps: FlowStep[];
  /** if set and evaluates true after an iteration, stop looping (break) */
  breakWhen?: ConditionExpr;
}

export type StateOp =
  | "set"
  | "increment"
  | "reset"
  | "stampNow"
  | "cooldownGate"
  | "thresholdGate";

export interface StateStep extends BaseStep {
  type: "state";
  op: StateOp;
  /** state key; may contain {{ refs }} to scope per-entity, e.g. "failCount:{{ steps.x.fqdn }}" */
  key: string;
  /** for set/increment */
  value?: string | number;
  /** cooldownGate: ms window; thresholdGate: count */
  amount?: number;
  /**
   * Gate ops (cooldownGate/thresholdGate) behave like a condition: if the gate
   * is NOT satisfied, apply onFail. cooldownGate passes when now-stamp >= amount.
   * thresholdGate passes when the counter >= amount.
   */
  onFail?: "stop" | "continue";
}

export type FlowStep =
  | ActionStep
  | ConditionStep
  | ForEachStep
  | StateStep;

export interface FlowTrigger {
  integrationId: string;
  triggerId: string;
  connectionId?: string | null;
  config: Record<string, unknown>;
  /** denormalized for cron triggers */
  cron?: string;
}

export interface FlowDefinition {
  trigger: FlowTrigger;
  steps: FlowStep[];
}

// ---------------------------------------------------------------------------
// Run records
// ---------------------------------------------------------------------------

export interface StepRecord {
  stepId: string;
  type: StepType;
  label?: string;
  status: "success" | "error" | "skipped";
  input?: unknown;
  output?: unknown;
  error?: string;
  logs?: string[];
  /** for forEach: per-iteration child records */
  iterations?: StepRecord[][];
}

export type RunTriggerKind = "manual" | "cron" | "webhook" | "poll";
