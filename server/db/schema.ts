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
    /** epoch ms for one-time ("at") schedules; null for recurring/manual */
    runAt: integer('run_at'),
    /** IANA timezone the cron/at schedule is evaluated in; null = server-local */
    timezone: text('timezone'),
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

/**
 * A subscribed browser/device for Web Push. One row per `PushSubscription`
 * (endpoint is unique). The full subscription JSON (endpoint + p256dh/auth
 * keys) is stored so the server can sign and POST push messages to it. Rows are
 * pruned automatically when a push gets a 404/410 (subscription gone).
 */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    /** the push service endpoint URL — unique per subscription */
    endpoint: text('endpoint').notNull(),
    /** full PushSubscriptionJSON: { endpoint, keys: { p256dh, auth }, expirationTime } */
    subscription: text('subscription', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    /** optional UA string to help the user recognise the device in a list */
    userAgent: text('user_agent'),
    createdAt: integer('created_at').notNull()
  },
  t => [unique('push_subscriptions_endpoint_uq').on(t.endpoint)]
)

/**
 * Tiny key/value store for server-managed secrets that aren't user-entered.
 * Currently holds the auto-generated VAPID keypair for Web Push (key
 * 'vapid' → { publicKey, privateKey }), generated once on first use so push
 * works with zero configuration. Env vars override it when set.
 */
export const appKeys = sqliteTable('app_keys', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  updatedAt: integer('updated_at').notNull()
})

/**
 * A user-defined shortcut: a labelled link to a URL, shown on the Shortcuts
 * page (and embeddable as a home-page widget). Optionally pingable: when
 * `pingEnabled` is set the page polls GET /api/shortcuts/:id/ping every
 * `pingInterval` seconds while open, checking `pingUrl` (or `url` when no
 * separate ping URL is given) for liveness. Ping results are not persisted —
 * they are live, per-open-tab.
 */
export const shortcuts = sqliteTable(
  'shortcuts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    /** optional lucide icon name (e.g. "i-lucide-globe") */
    icon: text('icon'),
    /** whether to ping this shortcut for liveness while a page is open */
    pingEnabled: integer('ping_enabled', { mode: 'boolean' }).notNull().default(false),
    /** optional separate URL to ping; falls back to `url` when null */
    pingUrl: text('ping_url'),
    /** seconds between pings while the page is open */
    pingInterval: integer('ping_interval').notNull().default(30),
    /** ordering on the Shortcuts page (ascending) */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [index('shortcuts_sort_idx').on(t.sortOrder)]
)

/**
 * A tile on the home bento grid. `kind` selects how the tile renders and what
 * `refId` points at:
 *   - "shortcut" → refId = shortcuts.id (link tile, live ping if configured)
 *   - "flow"     → refId = flows.id     (enabled/last-run + run-now)
 *   - "monitor"  → refId = monitors.id  (live gauges/status card)
 *   - "note"     → refId = null, content holds free markdown text
 * `w`/`h` are the tile's span in grid columns/rows (1–4). The referenced row
 * may be deleted independently; the home page skips dangling widgets.
 */
export const widgets = sqliteTable(
  'widgets',
  {
    id: text('id').primaryKey(),
    /** "shortcut" | "flow" | "monitor" | "note" */
    kind: text('kind').notNull(),
    /** id of the referenced entity, or null for self-contained tiles (note) */
    refId: text('ref_id'),
    /** free text for "note" tiles (markdown) */
    content: text('content'),
    /** column span on the bento grid (1–4) */
    w: integer('w').notNull().default(1),
    /** row span on the bento grid (1–4) */
    h: integer('h').notNull().default(1),
    /** ordering on the grid (ascending) */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [index('widgets_sort_idx').on(t.sortOrder)]
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
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert
export type AppKeyRow = typeof appKeys.$inferSelect
export type ShortcutRow = typeof shortcuts.$inferSelect
export type NewShortcutRow = typeof shortcuts.$inferInsert
export type WidgetRow = typeof widgets.$inferSelect
export type NewWidgetRow = typeof widgets.$inferInsert
