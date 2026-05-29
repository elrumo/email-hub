import { getIntegration } from './registry'
import type { ResolvedConnection } from './types'

/**
 * Pools live clients for stateful integrations (Mongo, Redis, SQL, …). Keyed by
 * connection id so every action on the same connection reuses one client rather
 * than connecting per `run()`. Idle clients are torn down after the
 * integration's `idleMs` (default 60s), and a client is dropped+recreated if the
 * connection's config changes (detected via a cheap config signature).
 *
 * HTTP integrations declare no `client` factory and never touch this — they just
 * `fetch`. For them `acquireClient` returns null.
 */
interface PoolEntry {
  client: unknown
  /** signature of the config the client was built from; rebuild if it changes */
  sig: string
  /** bound teardown so release never needs to re-resolve the integration */
  disconnect: (client: unknown) => Promise<void> | void
  idleTimer: ReturnType<typeof setTimeout> | null
  idleMs: number
}

const pool = new Map<string, PoolEntry>()
/** de-dupe concurrent connects for the same connection (forEach/parallel ticks) */
const inflight = new Map<string, Promise<unknown>>()

function configSig(config: Record<string, unknown>): string {
  // Order-independent-enough: JSON of sorted keys. Config is small and flat.
  return JSON.stringify(Object.keys(config).sort().map(k => [k, config[k]]))
}

function armIdleTimer(connectionId: string, entry: PoolEntry): void {
  if (entry.idleTimer) clearTimeout(entry.idleTimer)
  entry.idleTimer = setTimeout(() => {
    void releaseClient(connectionId)
  }, entry.idleMs)
  // don't keep the process alive just to close an idle pool client
  const timer = entry.idleTimer as { unref?: () => void }
  timer.unref?.()
}

/**
 * Get (or lazily create) the pooled client for a connection. Returns null when
 * the integration has no `client` factory. The returned client is owned by the
 * pool — callers must NOT close it; the pool tears it down when idle.
 */
export async function acquireClient(
  connection: ResolvedConnection,
  signal: AbortSignal
): Promise<unknown> {
  const integration = getIntegration(connection.integrationId)
  const factory = integration?.client
  if (!factory) return null

  const sig = configSig(connection.config)
  const existing = pool.get(connection.id)
  if (existing && existing.sig === sig) {
    armIdleTimer(connection.id, existing)
    return existing.client
  }
  // config changed — drop the stale client before reconnecting
  if (existing) await releaseClient(connection.id)

  const pending = inflight.get(connection.id)
  if (pending) return pending

  const idleMs = factory.idleMs ?? 60_000
  const connectPromise = Promise.resolve(factory.connect(connection.config, signal))
    .then((client) => {
      const entry: PoolEntry = { client, sig, disconnect: factory.disconnect, idleTimer: null, idleMs }
      pool.set(connection.id, entry)
      armIdleTimer(connection.id, entry)
      return client
    })
    .finally(() => inflight.delete(connection.id))
  inflight.set(connection.id, connectPromise)
  return connectPromise
}

/** Close and forget the pooled client for one connection (idle, edit, delete). */
export async function releaseClient(connectionId: string): Promise<void> {
  const entry = pool.get(connectionId)
  if (!entry) return
  pool.delete(connectionId)
  if (entry.idleTimer) clearTimeout(entry.idleTimer)
  try {
    await entry.disconnect(entry.client)
  } catch (e) {
    console.error(`[clientPool] disconnect failed for ${connectionId}:`, e instanceof Error ? e.message : e)
  }
}

/** Close every pooled client. Call on shutdown. */
export async function drainPool(): Promise<void> {
  const ids = [...pool.keys()]
  await Promise.all(ids.map(id => releaseClient(id)))
}
