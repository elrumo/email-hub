import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  sqliteTable,
  text,
  unique
} from 'drizzle-orm/sqlite-core'

/**
 * A saved set of credentials for one integration (e.g. a single Dokploy
 * instance, a Bunny account, a Discord webhook). `integrationId` matches the
 * `id` of a registered integration module; `config` holds that integration's
 * connection fields (validated against the integration's connectionSchema).
 *
 * NOTE: secrets are stored in plaintext inside `config` by design — the app is
 * a single-container, access-controlled self-hosted tool. Revisit if the DB is
 * ever backed up off-box.
 */
export const connections = sqliteTable(
  'connections',
  {
    id: text('id').primaryKey(),
    integrationId: text('integration_id').notNull(),
    name: text('name').notNull(),
    /** JSON blob of the integration's connection fields */
    config: text('config', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [
    index('connections_integration_idx').on(t.integrationId),
    unique('connections_integration_name_uq').on(t.integrationId, t.name)
  ]
)

/**
 * A monitor: one monitorable connection (an integration with a `monitoring`
 * capability — e.g. Dokploy, Uptime Kuma) plus a per-target config. Shown on
 * the Monitoring page, which snapshots each monitor on demand by running the
 * integration's `monitoring.snapshotAction` with `targetConfig` as input.
 *
 * `integrationId` is denormalized from the connection so listing doesn't need a
 * join. `targetConfig` is integration-specific (validated against the
 * integration's monitoring.targetSchema): for Dokploy it holds the metrics
 * URL/token + serverId; for Kuma it holds the monitor name.
 */
export const monitors = sqliteTable(
  'monitors',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    integrationId: text('integration_id').notNull(),
    name: text('name').notNull(),
    /** JSON blob of the integration's monitoring target fields */
    targetConfig: text('target_config', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [index('monitors_connection_idx').on(t.connectionId)]
)

/**
 * A user-defined automation: one trigger + an ordered list of steps. The
 * full definition lives in `definition` (validated by the engine), so the
 * engine schema can evolve without DB migrations.
 *
 * definition shape (see server/engine/types.ts FlowDefinition):
 *   { trigger: {...}, steps: [...] }
 */
export const flows = sqliteTable(
  'flows',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    /** JSON FlowDefinition */
    definition: text('definition', { mode: 'json' }).notNull().$type<unknown>(),
    /** cached cron expression (denormalized from definition.trigger) for the scheduler */
    cron: text('cron'),
    /** epoch ms of the last time the scheduler ran this flow (cron bookkeeping) */
    lastRunAt: integer('last_run_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [index('flows_enabled_idx').on(t.enabled)]
)

/**
 * One execution of a flow. `steps` captures per-step input/output/error so the
 * UI can show exactly what happened. `trigger` records how the run started.
 */
export const flowRuns = sqliteTable(
  'flow_runs',
  {
    id: text('id').primaryKey(),
    flowId: text('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    /** "manual" | "cron" | "webhook" */
    trigger: text('trigger').notNull(),
    /** "running" | "success" | "error" | "skipped" */
    status: text('status').notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    error: text('error'),
    /** JSON array of per-step records: {stepId, type, input, output, error, skipped} */
    steps: text('steps', { mode: 'json' }).$type<unknown[]>(),
    createdAt: integer('created_at').notNull()
  },
  t => [
    index('flow_runs_flow_idx').on(t.flowId),
    index('flow_runs_started_idx').on(t.startedAt)
  ]
)

/**
 * Per-flow named scratch state: counters, timestamps, strings. Powers the
 * "flow state" step primitive (increment/set/compare) and the cooldown /
 * threshold helpers used by the failover flow. Keyed by (flowId, key); an
 * optional `scope` lets a flow keep state per-entity (e.g. per-fqdn) by
 * embedding the entity in the key.
 */
export const flowState = sqliteTable(
  'flow_state',
  {
    flowId: text('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** JSON-encoded value (number | string | boolean) */
    value: text('value', { mode: 'json' }).$type<unknown>(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [
    // composite primary key via unique index on (flowId, key)
    unique('flow_state_pk').on(t.flowId, t.key)
  ]
)

export const schemaSql = sql // re-export marker to keep tree-shaking honest

export type ConnectionRow = typeof connections.$inferSelect
export type NewConnectionRow = typeof connections.$inferInsert
export type MonitorRow = typeof monitors.$inferSelect
export type NewMonitorRow = typeof monitors.$inferInsert
export type FlowRow = typeof flows.$inferSelect
export type NewFlowRow = typeof flows.$inferInsert
export type FlowRunRow = typeof flowRuns.$inferSelect
export type NewFlowRunRow = typeof flowRuns.$inferInsert
export type FlowStateRow = typeof flowState.$inferSelect
