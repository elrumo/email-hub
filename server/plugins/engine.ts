import path from "node:path";
import { initDb } from "../db";
import { schedulerTick } from "../engine/scheduler";
import { registerAllIntegrations } from "../integrations";

/**
 * Boots the flow engine: opens the SQLite DB (running migrations), registers
 * all integrations, and starts the scheduler loop. Mirrors the structure of
 * the legacy failover plugin (init → forever loop with per-tick catch).
 *
 * The DB file lives on the /data volume (NUXT_DB_FILE). Migrations are bundled
 * by Nitro from server/db/migrations.
 */
export default async function () {
  const cfg = useRuntimeConfig();
  const dbFile = (cfg.dbFile as string) || "/data/app.db";

  // Migrations folder: in dev it's the source path; Nitro copies it into the
  // server bundle for prod. Resolve relative to this module's directory.
  const migrationsDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../db/migrations"
  );

  try {
    initDb({ dbFile, migrationsDir });
    registerAllIntegrations();
    console.log(`[engine] db ready at ${dbFile}; integrations registered`);
  } catch (e) {
    console.error("[engine] boot failed:", e instanceof Error ? e.message : e);
    return;
  }

  const intervalMs = Number(cfg.schedulerIntervalMs || 0) || 30_000;
  const ac = new AbortController();
  loop(intervalMs, ac.signal);
  console.log(`[engine] scheduler started (interval=${intervalMs}ms)`);
}

async function loop(intervalMs: number, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      await schedulerTick(Date.now(), signal);
    } catch (e) {
      console.error("[engine] scheduler tick failed:", e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
