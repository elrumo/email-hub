import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  sqliteTable,
  text,
  unique
} from 'drizzle-orm/sqlite-core'

/**
 * A user account. Authentication is username + password (argon2id hash via
 * Bun.password). `role` gates the admin overview. The instance is bootstrapped
 * by creating the first user as an `admin` (the first-run setup flow), which
 * also adopts any pre-existing ownerless rows. Signup after that is open and
 * creates `user`-role accounts.
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    email: text('email'),
    /** argon2id hash (full encoded string from Bun.password.hash) */
    passwordHash: text('password_hash').notNull(),
    /** "admin" | "user" */
    role: text('role').notNull().default('user'),
    lastLoginAt: integer('last_login_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [unique('users_username_uq').on(t.username)]
)

/**
 * An opaque server-side session. The row `id` is the random token stored in the
 * `dd_session` cookie — there is no JWT and no signing secret; validity is a DB
 * lookup. Expired rows are rejected and pruned on access.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** epoch ms after which the session is invalid */
    expiresAt: integer('expires_at').notNull(),
    /** optional UA string, to show the device in the account page later */
    userAgent: text('user_agent'),
    createdAt: integer('created_at').notNull()
  },
  t => [index('sessions_user_idx').on(t.userId)]
)

/**
 * An audit/activity entry. One row per meaningful action a user takes
 * (auth.login, connection.create, flow.run, …). Powers the per-user activity
 * log on the account page and the admin overview. `detail` is an optional JSON
 * blob with action-specific context (e.g. flow run status).
 */
export const activityLog = sqliteTable(
  'activity_log',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** dotted action key, e.g. "connection.create", "flow.run", "auth.login" */
    action: text('action').notNull(),
    /** optional entity kind/id the action targeted */
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    /** optional JSON context */
    detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at').notNull()
  },
  t => [
    index('activity_user_idx').on(t.userId),
    index('activity_created_idx').on(t.createdAt)
  ]
)

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
    /** owning user (FK→users.id); nullable only as a migration artifact, always set on insert */
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    integrationId: text('integration_id').notNull(),
    name: text('name').notNull(),
    /** JSON blob of the integration's connection fields */
    config: text('config', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [
    index('connections_integration_idx').on(t.integrationId),
    index('connections_owner_idx').on(t.ownerId),
    // names are unique per owner+integration, not globally
    unique('connections_owner_integration_name_uq').on(t.ownerId, t.integrationId, t.name)
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
    /** owning user (FK→users.id); nullable only as a migration artifact, always set on insert */
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
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
  t => [
    index('monitors_connection_idx').on(t.connectionId),
    index('monitors_owner_idx').on(t.ownerId)
  ]
)

/**
 * Time-series samples for a "constant ping" monitor (integrationId === "ping").
 * Unlike Dokploy/Kuma — which are snapshotted on demand by the page — a ping
 * monitor is driven by a server-side loop (server/utils/pingMonitor.ts, run from
 * the scheduler): on its configured interval, for the configured duration, it
 * fires one HTTP request and appends a row here. The monitor's snapshot action
 * reads the latest row (current up/down) plus a recent window (latency series).
 *
 * Rows are pruned to a bounded retention window per monitor so the table can't
 * grow without limit. `monitorId` cascades on monitor delete.
 */
export const pingSamples = sqliteTable(
  'ping_samples',
  {
    id: text('id').primaryKey(),
    monitorId: text('monitor_id')
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    /** epoch ms the ping was taken */
    ts: integer('ts').notNull(),
    /** true if the endpoint responded acceptably (per the monitor's success rule) */
    ok: integer('ok', { mode: 'boolean' }).notNull(),
    /** HTTP status code, or 0 when the request never completed (DNS/timeout/refused) */
    status: integer('status').notNull(),
    /** round-trip time in ms (null when the request failed before a response) */
    latencyMs: integer('latency_ms'),
    /** short failure reason when !ok (timeout / DNS / blocked / status), else null */
    error: text('error')
  },
  t => [
    index('ping_samples_monitor_ts_idx').on(t.monitorId, t.ts)
  ]
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
    /**
     * owning user (FK→users.id). This is the source of truth for unattended
     * runs: the scheduler/runner loads connections scoped to this owner, so no
     * session is needed inside the engine. Nullable only as a migration
     * artifact — always set on insert.
     */
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    /**
     * Whether this flow may be triggered by unauthenticated visitors of a
     * public board it appears on. A board's own `publicTrigger` flag takes
     * precedence over this per-flow flag (board-on overrides flow-off and
     * applies to every flow on the board).
     */
    publicTrigger: integer('public_trigger', { mode: 'boolean' }).notNull().default(false),
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
  t => [
    index('flows_enabled_idx').on(t.enabled),
    index('flows_owner_idx').on(t.ownerId)
  ]
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
    /** owning user (FK→users.id); nullable only as a migration artifact, always set on insert */
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
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
  t => [
    index('shortcuts_sort_idx').on(t.sortOrder),
    index('shortcuts_owner_idx').on(t.ownerId)
  ]
)

/**
 * A board: one named home grid belonging to a user. A user can keep several
 * boards and mark one as their `isDefault` (the one the home page opens on).
 *
 * A board can be made `isPublic`, in which case it is viewable read-only by
 * unauthenticated visitors at `/b/<slug>` (slug is unique across all boards so
 * the public URL is unambiguous). When `publicTrigger` is set, every flow tile
 * on the board may be run by those public visitors — this board-level flag
 * overrides the per-flow `flows.publicTrigger` flag and applies to all flows on
 * the board. The public view only ever exposes display fields, never the
 * underlying connection configs or webhook secrets.
 */
export const boards = sqliteTable(
  'boards',
  {
    id: text('id').primaryKey(),
    /** owning user (FK→users.id); nullable only as a migration artifact, always set on insert */
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** url-safe unique identifier used for the public `/b/<slug>` view */
    slug: text('slug').notNull(),
    /** the board the home page opens on; exactly one per user is true */
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    /** viewable read-only by unauthenticated visitors at /b/<slug> */
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    /** allow public visitors to trigger every flow on this board (overrides per-flow flag) */
    publicTrigger: integer('public_trigger', { mode: 'boolean' }).notNull().default(false),
    /** ordering in the board switcher (ascending) */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [
    index('boards_owner_idx').on(t.ownerId),
    unique('boards_slug_uq').on(t.slug)
  ]
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
    /** owning user (FK→users.id); nullable only as a migration artifact, always set on insert */
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    /** the board this tile lives on (FK→boards.id); nullable only as a migration artifact, always set on insert */
    boardId: text('board_id').references(() => boards.id, { onDelete: 'cascade' }),
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
  t => [
    index('widgets_sort_idx').on(t.sortOrder),
    index('widgets_owner_idx').on(t.ownerId),
    index('widgets_board_idx').on(t.boardId)
  ]
)

/**
 * An email design project: a named document made of email blocks (see
 * app/email/blocks.ts EmailDocument). The block tree lives in `document` as a
 * JSON blob so the block schema can evolve without DB migrations — the renderer
 * (app/email/render.ts) turns it into email-safe, table-based, inline-styled
 * HTML. The AI chat (server/api/email-projects/[id]/chat.post.ts) edits this
 * document via tool calls and the editor saves it back via PUT.
 */
export const emailProjects = sqliteTable(
  'email_projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** JSON EmailDocument: { settings, blocks: [...] } */
    document: text('document', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [index('email_projects_updated_idx').on(t.updatedAt)]
)

/**
 * One message in an email project's AI chat history. Stores the Vercel AI SDK
 * `UIMessage` shape directly: `role` ('user' | 'assistant' | 'system') plus the
 * full `parts` array (text / reasoning / tool-invocation parts) as JSON, so the
 * client can rehydrate the conversation verbatim on reload. Ordered by
 * `createdAt`; cascade-deleted with the project.
 */
export const emailChatMessages = sqliteTable(
  'email_chat_messages',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => emailProjects.id, { onDelete: 'cascade' }),
    /** "user" | "assistant" | "system" */
    role: text('role').notNull(),
    /** JSON array of AI SDK UIMessage parts */
    parts: text('parts', { mode: 'json' }).notNull().$type<unknown[]>(),
    createdAt: integer('created_at').notNull()
  },
  t => [index('email_chat_messages_project_idx').on(t.projectId, t.createdAt)]
)

/**
 * A user-uploaded declarative connector (community connector). `def` holds the
 * full `ConnectorDef` JSON (see server/connectors/types.ts) — pure data, no
 * code. At boot and on every change, each enabled row is validated, compiled
 * into an `Integration` (server/connectors/compile.ts) and registered under the
 * namespaced id `x-<connectorId>`, so it shows up in the catalog and is usable
 * in flows exactly like a built-in integration.
 *
 * `connectorId` is the un-prefixed id from the def (unique); `enabled` lets a
 * user keep a connector installed without registering it.
 */
export const connectors = sqliteTable(
  'connectors',
  {
    id: text('id').primaryKey(),
    /** the ConnectorDef.id (un-prefixed); unique across installed connectors */
    connectorId: text('connector_id').notNull(),
    name: text('name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    /** full ConnectorDef JSON */
    def: text('def', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    /** optional marketplace provenance (source URL / author), informational */
    source: text('source'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  t => [unique('connectors_connector_id_uq').on(t.connectorId)]
)

export const schemaSql = sql // re-export marker to keep tree-shaking honest

export type UserRow = typeof users.$inferSelect
export type NewUserRow = typeof users.$inferInsert
export type SessionRow = typeof sessions.$inferSelect
export type NewSessionRow = typeof sessions.$inferInsert
export type ActivityLogRow = typeof activityLog.$inferSelect
export type NewActivityLogRow = typeof activityLog.$inferInsert
export type ConnectionRow = typeof connections.$inferSelect
export type NewConnectionRow = typeof connections.$inferInsert
export type ConnectorRow = typeof connectors.$inferSelect
export type NewConnectorRow = typeof connectors.$inferInsert
export type MonitorRow = typeof monitors.$inferSelect
export type NewMonitorRow = typeof monitors.$inferInsert
export type PingSampleRow = typeof pingSamples.$inferSelect
export type NewPingSampleRow = typeof pingSamples.$inferInsert
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
export type BoardRow = typeof boards.$inferSelect
export type NewBoardRow = typeof boards.$inferInsert
export type WidgetRow = typeof widgets.$inferSelect
export type NewWidgetRow = typeof widgets.$inferInsert
export type EmailProjectRow = typeof emailProjects.$inferSelect
export type NewEmailProjectRow = typeof emailProjects.$inferInsert
export type EmailChatMessageRow = typeof emailChatMessages.$inferSelect
export type NewEmailChatMessageRow = typeof emailChatMessages.$inferInsert
