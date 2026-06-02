import { ensureSchema } from '../db/migrate'

/**
 * Run the idempotent schema bootstrap once at server startup so the very first
 * request already has its tables. Failures are logged but don't crash boot —
 * Postgres may still be coming up; the next request retries.
 */
export default defineNitroPlugin(() => {
  ensureSchema().catch((e) => {
    console.error('[db] schema bootstrap failed (will retry on demand):', e instanceof Error ? e.message : e)
  })
})
