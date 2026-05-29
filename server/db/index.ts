import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import * as schema from './schema'

export type DB = BunSQLiteDatabase<typeof schema>

let _db: DB | null = null

/**
 * Open (once) the SQLite database on the /data volume and run migrations.
 * Idempotent — repeated calls return the same instance.
 */
export function initDb(opts: { dbFile: string, migrationsDir: string }): DB {
  if (_db) return _db

  // ensure the parent dir exists (e.g. /data) before opening
  mkdirSync(path.dirname(opts.dbFile), { recursive: true })

  const sqlite = new Database(opts.dbFile, { create: true })
  // pragmatic defaults for a small embedded write-heavy-ish workload
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  sqlite.exec('PRAGMA busy_timeout = 5000;')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: opts.migrationsDir })

  _db = db
  return _db
}

/** Access the initialized DB. Throws if initDb() hasn't run (boot ordering bug). */
export function getDb(): DB {
  if (!_db) {
    throw new Error('[db] getDb() called before initDb() — check plugin boot order')
  }
  return _db
}

export { schema }
