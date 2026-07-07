import { saveParseFile } from '../utils/parse'
import { requireUser } from '../utils/auth'
import { assertRateLimit } from '../utils/rateLimit'

/**
 * Image uploads for email blocks. Files land in Parse's file store (GridFS in
 * Mongo out of the box, S3 when configured) and come back as a public URL the
 * image block can use — no more hotlinking placeholders.
 *
 * Body: { name, contentType, data } with data base64-encoded.
 */
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

/** ~5 MB of raw image; base64 inflates by 4/3. */
const MAX_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3)

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  assertRateLimit(event, 'uploads', {
    limit: 30,
    windowMs: 5 * 60_000,
    key: user.id,
    message: 'Too many uploads — wait a few minutes and try again.'
  })

  const body = await readBody<{ name?: string, contentType?: string, data?: string }>(event)
  const contentType = (body.contentType ?? '').toLowerCase()
  const ext = ALLOWED_TYPES[contentType]
  if (!ext) {
    throw createError({ statusCode: 422, statusMessage: 'Only PNG, JPEG, GIF and WebP images are supported.' })
  }

  const data = (body.data ?? '').replace(/^data:[^;]+;base64,/, '')
  if (!data) throw createError({ statusCode: 422, statusMessage: 'No file data received.' })
  if (data.length > MAX_BASE64_LENGTH) {
    throw createError({ statusCode: 413, statusMessage: 'Images are limited to 5 MB.' })
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 1024))) {
    throw createError({ statusCode: 422, statusMessage: 'File data must be base64-encoded.' })
  }

  // Keep a recognizable, safe filename; Parse prepends a unique id.
  const base = (body.name ?? 'image')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9-_]/gi, '_')
    .slice(0, 60) || 'image'

  try {
    const file = await saveParseFile(`${base}.${ext}`, data, contentType)
    return { url: file.url, name: file.name }
  } catch (e) {
    console.error('[uploads] save failed:', e instanceof Error ? e.message : e)
    throw createError({ statusCode: 502, statusMessage: 'Could not store the image — check the file storage configuration.' })
  }
})
