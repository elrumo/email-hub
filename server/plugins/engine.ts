import path from 'node:path'
import { initDb } from '../db'
import { drainPool } from '../engine/clientPool'
import { schedulerTick } from '../engine/scheduler'
import { registerAllIntegrations } from '../integrations'

/**
 * Boots the flow engine: opens the SQLite DB (running migrations), registers
 * all integrations, and starts the scheduler loop. Mirrors the structure of
 * the legacy failover plugin (init → forever loop with per-tick catch).
 *
 * The DB file lives on the /data volume (NUXT_DB_FILE). Migrations are bundled
 * by Nitro from server/db/migrations.
 */
export default async function (nitroApp?: { hooks?: { hook: (name: string, fn: () => unknown) => void } }) {
  const cfg = useRuntimeConfig()
  const dbFile = (cfg.dbFile as string) || '/data/app.db'

  // Migrations folder. Resolved from the server asset dir in prod (Nitro copies
  // it there via the config below) or the source tree in dev. NUXT_MIGRATIONS_DIR
  // lets the container override it explicitly.
  const migrationsDir
    = (process.env.NUXT_MIGRATIONS_DIR as string)
      || path.resolve(process.cwd(), 'server/db/migrations')

  try {
    initDb({ dbFile, migrationsDir })
    registerAllIntegrations()
    console.log(`[engine] db ready at ${dbFile}; integrations registered`)
  } catch (e) {
    console.error('[engine] boot failed:', e instanceof Error ? e.message : e)
    return
  }

  const intervalMs = Number(cfg.schedulerIntervalMs || 0) || 30_000
  const ac = new AbortController()
  loop(intervalMs, ac.signal)
  console.log(`[engine] scheduler started (interval=${intervalMs}ms)`)

  // tear down pooled clients (Mongo/SQL/etc.) on shutdown
  nitroApp?.hooks?.hook('close', async () => {
    ac.abort()
    await drainPool()
  })
}

async function loop(intervalMs: number, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      await schedulerTick(Date.now(), signal)
    } catch (e) {
      console.error('[engine] scheduler tick failed:', e instanceof Error ? e.message : e)
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
}
