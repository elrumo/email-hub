/// <reference types="bun-types" />
/**
 * Upload an email asset (image or file) to an S3 connection and return a URL
 * usable inside an email.
 *
 * Multipart body:
 *   - file:         the binary file (required)
 *   - connectionId: which S3 connection to upload to (required)
 *
 * The object is stored under `email-assets/<random>-<safe-name>` and made
 * public-read. We return:
 *   - url:        the email-ready URL. Prefer the connection's `publicBaseUrl`
 *                 (permanent). If none is set we fall back to a 7-day presigned
 *                 GET URL and flag `temporary: true` so the UI can warn.
 *   - key, kind ('image' | 'file'), contentType, size, name.
 *
 * Auth + S3 access reuse the same connection store and pooled client as the
 * flow engine (server/integrations/s3.ts), so credentials live in one place.
 */
import type { S3Client } from 'bun'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections } from '../../db/schema'
import { acquireClient } from '../../engine/clientPool'
import { registerAllIntegrations } from '../../integrations'

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB — generous for email imagery/PDFs

/** Lower-case, strip path, keep a short safe filename for the object key. */
function safeName(name: string): string {
  const base = (name.split(/[\\/]/).pop() || 'file').toLowerCase()
  return base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file'
}

export default defineEventHandler(async (event) => {
  registerAllIntegrations()

  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'expected multipart form data' })

  const filePart = parts.find(p => p.name === 'file' && p.filename)
  const connectionId = parts.find(p => p.name === 'connectionId')?.data.toString().trim()
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'file is required' })
  if (!connectionId) throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  if (filePart.data.length > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `file exceeds ${MAX_BYTES / 1024 / 1024}MB limit` })
  }

  const db = getDb()
  const rows = await db.select().from(connections).where(eq(connections.id, connectionId))
  const row = rows[0]
  if (!row || row.integrationId !== 's3') {
    throw createError({ statusCode: 404, statusMessage: 'S3 connection not found' })
  }

  const contentType = filePart.type || 'application/octet-stream'
  const isImage = contentType.startsWith('image/')
  // time-free random component (Date.now() is unavailable in some contexts but
  // available here; keep it simple and collision-resistant enough for assets)
  const rand = Math.random().toString(36).slice(2, 10)
  const key = `email-assets/${rand}-${safeName(filePart.filename || 'file')}`

  const signal = (event.node.req as unknown as { signal?: AbortSignal }).signal ?? new AbortController().signal
  const client = await acquireClient(
    { id: row.id, integrationId: row.integrationId, name: row.name, config: row.config },
    signal
  ) as S3Client | null
  if (!client) throw createError({ statusCode: 500, statusMessage: 'S3 client unavailable' })

  try {
    await client.write(key, filePart.data, { type: contentType, acl: 'public-read' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'upload failed'
    throw createError({ statusCode: 502, statusMessage: `S3 upload failed: ${msg}` })
  }

  const cfg = row.config as Record<string, unknown>
  const publicBaseUrl = String(cfg.publicBaseUrl ?? '').trim().replace(/\/$/, '')

  let url: string
  let temporary = false
  if (publicBaseUrl) {
    url = `${publicBaseUrl}/${key}`
  } else {
    // No permanent public URL configured — hand back a 7-day presigned GET so
    // the asset at least works for previews/short-lived sends. The UI warns.
    url = client.presign(key, { method: 'GET', expiresIn: 7 * 24 * 3600, acl: 'public-read' })
    temporary = true
  }

  return {
    url,
    key,
    kind: isImage ? 'image' : 'file',
    contentType,
    size: filePart.data.length,
    name: filePart.filename || safeName(filePart.filename || 'file'),
    temporary
  }
})
