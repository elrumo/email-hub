import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections } from '../../db/schema'

/**
 * List the S3 connections available for uploading email assets. Returns just
 * what the picker needs (id, name, bucket, whether a public base URL is set) —
 * never secrets. `hasPublicBaseUrl` lets the UI warn when uploads would not get
 * a permanent public URL (which email clients require).
 */
export default defineEventHandler(async () => {
  const db = getDb()
  const rows = await db.select().from(connections).where(eq(connections.integrationId, 's3'))
  return rows.map((row) => {
    const cfg = row.config as Record<string, unknown>
    return {
      id: row.id,
      name: row.name,
      bucket: String(cfg.bucket ?? ''),
      hasPublicBaseUrl: Boolean(String(cfg.publicBaseUrl ?? '').trim())
    }
  })
})
