/**
 * Database handle — Postgres via Bun's native SQL driver, wired to Drizzle.
 *
 * Bun ships a built-in, high-performance Postgres client (`Bun.SQL`); the
 * `drizzle-orm/bun-sql` adapter binds it to Drizzle so we get typed queries with
 * zero extra native deps. A single connection pool is created lazily and reused
 * for the process lifetime.
 */
import { SQL } from 'bun'
import { drizzle, type BunSQLDatabase } from 'drizzle-orm/bun-sql'
import * as schema from './schema'

let _client: SQL | null = null
let _db: BunSQLDatabase<typeof schema> | null = null

function connectionString(): string {
  const url = process.env.NUXT_DATABASE_URL || useRuntimeConfig().databaseUrl
  if (!url) {
    throw new Error('NUXT_DATABASE_URL is not set — point it at your Postgres instance.')
  }
  return url
}

export function getClient(): SQL {
  if (!_client) _client = new SQL(connectionString())
  return _client
}

export function getDb(): BunSQLDatabase<typeof schema> {
  if (!_db) _db = drizzle({ client: getClient(), schema })
  return _db
}
