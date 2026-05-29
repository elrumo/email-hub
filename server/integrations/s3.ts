/// <reference types="bun-types" />
import type { S3Client } from 'bun'
import type { ActionContext, Integration } from '../engine/types'

// Bun's native S3 client (https://bun.sh/docs/api/s3). The triple-slash
// reference above pulls in bun-types regardless of the surrounding tsconfig's
// `types` array (vue-tsc's project resolution doesn't reliably apply it here),
// which makes both the `'bun'` module type and the `Bun` global resolve.
const BunS3Client = Bun.S3Client

/**
 * MinIO / S3-compatible object storage. Works with MinIO, AWS S3, Cloudflare R2,
 * DigitalOcean Spaces, Backblaze B2 — anything that speaks the S3 API.
 *
 * Uses Bun's native `S3Client` (https://bun.sh/docs/api/s3), which signs every
 * request with AWS Signature V4 — so there are zero extra dependencies and no
 * hand-rolled signing. Like Mongo, this is a *stateful* integration: it holds a
 * configured client, so it uses the engine's `client` factory (the pool builds
 * ONE `S3Client` per connection and hands it to every action via `ctx.client`).
 *
 * The client is just a credentials/endpoint holder — it opens no sockets until a
 * method that hits the network is called — but pooling it keeps construction out
 * of the hot path and matches the other stateful integrations.
 */

/** Build an S3Client from a connection's config. Throws on missing essentials. */
function buildClient(config: Record<string, unknown>): S3Client {
  const accessKeyId = String(config.accessKeyId ?? '').trim()
  const secretAccessKey = String(config.secretAccessKey ?? '')
  const bucket = String(config.bucket ?? '').trim()
  const endpoint = String(config.endpoint ?? '').trim()
  if (!accessKeyId || !secretAccessKey) throw new Error('S3 connection is missing access key / secret')
  if (!bucket) throw new Error('S3 connection has no bucket')
  return new BunS3Client({
    accessKeyId,
    secretAccessKey,
    bucket,
    // MinIO & most self-hosted services need an explicit endpoint; AWS can infer
    // from region, so endpoint is optional and only set when provided.
    ...(endpoint ? { endpoint } : {}),
    ...(String(config.region ?? '').trim() ? { region: String(config.region).trim() } : {}),
    // path-style is the safe default for MinIO; virtual-hosted is opt-in.
    ...(config.virtualHostedStyle === true ? { virtualHostedStyle: true } : {})
  })
}

function client(ctx: ActionContext): S3Client {
  const c = ctx.client as S3Client | null
  if (!c) throw new Error('S3 client unavailable (no connection?)')
  return c
}

function requireKey(ctx: ActionContext): string {
  const key = String(ctx.input.key ?? '').trim()
  if (!key) throw new Error('key is required')
  return key
}

export const s3Integration: Integration = {
  id: 's3',
  name: 'MinIO / S3',
  icon: 'i-simple-icons-minio',
  connectionSchema: [
    {
      key: 'endpoint',
      label: 'Endpoint URL',
      type: 'string',
      placeholder: 'http://localhost:9000',
      help: 'Your MinIO/S3 endpoint. Leave blank for AWS S3 (it is inferred from the region).'
    },
    { key: 'bucket', label: 'Bucket', type: 'string', required: true, placeholder: 'backups' },
    {
      key: 'publicBaseUrl',
      label: 'Public base URL',
      type: 'string',
      placeholder: 'https://cdn.example.com',
      help: 'Optional. Where objects in this bucket are publicly served (e.g. a CDN or the bucket\'s public endpoint). Used by the email designer so uploaded images get a permanent public URL — {publicBaseUrl}/{key}. The bucket/prefix must be publicly readable.'
    },
    { key: 'accessKeyId', label: 'Access key ID', type: 'string', required: true },
    { key: 'secretAccessKey', label: 'Secret access key', type: 'secret', required: true },
    {
      key: 'region',
      label: 'Region',
      type: 'string',
      placeholder: 'us-east-1',
      advanced: true,
      help: 'Optional. Required for AWS S3 when no endpoint is given; MinIO usually ignores it.'
    },
    {
      key: 'virtualHostedStyle',
      label: 'Virtual-hosted-style URLs',
      type: 'boolean',
      default: false,
      advanced: true,
      help: 'Off (path-style) is correct for most MinIO setups. Turn on for AWS-style bucket.host URLs.'
    }
  ],
  client: {
    connect: async config => buildClient(config),
    // S3Client holds no live sockets of its own; nothing to tear down.
    disconnect: () => {},
    idleMs: 120_000
  },
  testConnection: async (config, _signal) => {
    if (!String(config.bucket ?? '').trim()) return { ok: false, message: 'Bucket is required' }
    if (!String(config.accessKeyId ?? '').trim() || !String(config.secretAccessKey ?? '')) {
      return { ok: false, message: 'Access key and secret are required' }
    }
    try {
      // cheap authed read: list at most one object in the bucket
      const c = buildClient(config)
      await c.list({ maxKeys: 1 })
      return { ok: true, message: `Connected — bucket "${config.bucket}" reachable` }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reach S3'
      // Bun surfaces auth/signature problems via these codes
      const code = (e as { code?: string })?.code
      if (code === 'ERR_S3_INVALID_SIGNATURE' || /signature|access ?key|forbidden|403/i.test(msg)) {
        return { ok: false, message: 'Credentials rejected (signature/access denied)' }
      }
      return { ok: false, message: msg }
    }
  },
  triggers: [
    {
      id: 'objectExists',
      name: 'When an object exists (or is missing)',
      description:
        'Polls one object key and fires while its presence matches the chosen test. Like other poll triggers it fires on EVERY check while the test passes — add a cooldown/threshold gate in the flow if you want it to act once. Exposes {{ trigger.key }} and {{ trigger.exists }}.',
      kind: 'poll',
      needsConnection: true,
      configSchema: [
        { key: 'key', label: 'Object key', type: 'string', required: true, placeholder: 'backups/latest.tar.gz' },
        { key: 'fireWhen', label: 'Fires when the object…', type: 'select', default: 'present', options: [
          { label: 'exists', value: 'present' },
          { label: 'is missing', value: 'absent' }
        ] }
      ],
      poll: async (ctx) => {
        const key = String(ctx.config.key ?? '').trim()
        if (!key) return null
        const c = buildClient(ctx.connection!.config)
        let exists: boolean
        try {
          exists = await c.exists(key)
        } catch {
          return null // bucket unreachable / creds bad → don't fire
        }
        const want = String(ctx.config.fireWhen ?? 'present') === 'present'
        if (exists !== want) return null
        return { key, exists }
      }
    }
  ],
  actions: [
    {
      id: 'getObject',
      name: 'Get an object (text)',
      description: 'Downloads an object and returns its contents as text. For binary data, prefer a presigned URL.',
      needsConnection: true,
      inputSchema: [
        { key: 'key', label: 'Object key', type: 'string', required: true, placeholder: 'config/flags.json' }
      ],
      outputKeys: ['key', 'body', 'size'],
      run: async (ctx) => {
        const key = requireKey(ctx)
        const body = await client(ctx).file(key).text()
        ctx.log(`s3 get ${key}: ${body.length} char(s)`)
        return { key, body, size: body.length }
      }
    },
    {
      id: 'putObject',
      name: 'Put an object',
      description: 'Uploads (or overwrites) an object with the given text body.',
      needsConnection: true,
      inputSchema: [
        { key: 'key', label: 'Object key', type: 'string', required: true, placeholder: 'logs/last-run.txt' },
        { key: 'body', label: 'Body', type: 'string', required: true, help: 'The text content to store.' },
        { key: 'contentType', label: 'Content type', type: 'string', placeholder: 'text/plain', advanced: true }
      ],
      outputKeys: ['key', 'bytesWritten'],
      run: async (ctx) => {
        const key = requireKey(ctx)
        const body = String(ctx.input.body ?? '')
        const type = String(ctx.input.contentType ?? '').trim()
        const bytesWritten = await client(ctx).write(key, body, type ? { type } : undefined)
        ctx.log(`s3 put ${key}: ${bytesWritten} byte(s)`)
        return { key, bytesWritten }
      }
    },
    {
      id: 'deleteObject',
      name: 'Delete an object',
      description: 'Deletes an object by key. Succeeds whether or not the object existed.',
      needsConnection: true,
      inputSchema: [
        { key: 'key', label: 'Object key', type: 'string', required: true }
      ],
      outputKeys: ['key', 'deleted'],
      run: async (ctx) => {
        const key = requireKey(ctx)
        await client(ctx).delete(key)
        ctx.log(`s3 delete ${key}`)
        return { key, deleted: true }
      }
    },
    {
      id: 'statObject',
      name: 'Stat an object',
      description: 'Returns size, etag, last-modified and content type for an object without downloading it.',
      needsConnection: true,
      inputSchema: [
        { key: 'key', label: 'Object key', type: 'string', required: true }
      ],
      outputKeys: ['key', 'exists', 'size', 'etag', 'lastModified'],
      run: async (ctx) => {
        const key = requireKey(ctx)
        try {
          const stat = await client(ctx).stat(key)
          return {
            key,
            exists: true,
            size: stat.size,
            etag: stat.etag,
            lastModified: stat.lastModified.toISOString()
          }
        } catch (e) {
          // a missing object is a normal, non-throwing result for "stat"
          const code = (e as { code?: string })?.code
          if (code === 'ERR_S3_INVALID_PATH' || /not ?found|404|no such key/i.test(String((e as Error)?.message ?? ''))) {
            return { key, exists: false, size: null, etag: null, lastModified: null }
          }
          throw e
        }
      }
    },
    {
      id: 'listObjects',
      name: 'List objects',
      description: 'Lists up to 1000 objects under a prefix. Returns the keys and whether the listing was truncated.',
      needsConnection: true,
      inputSchema: [
        { key: 'prefix', label: 'Prefix', type: 'string', placeholder: 'backups/', help: 'Empty lists the whole bucket.' },
        { key: 'maxKeys', label: 'Max keys', type: 'number', default: 1000 }
      ],
      outputKeys: ['objects', 'keys', 'count', 'truncated'],
      run: async (ctx) => {
        const prefix = String(ctx.input.prefix ?? '').trim()
        const maxKeys = Math.min(1000, Math.max(1, Number(ctx.input.maxKeys ?? 1000) || 1000))
        const res = await client(ctx).list({ ...(prefix ? { prefix } : {}), maxKeys })
        const contents = res?.contents ?? []
        const objects = contents.map(o => ({ key: o.key, size: o.size ?? null, etag: o.eTag ?? null, lastModified: o.lastModified ?? null }))
        ctx.log(`s3 list ${prefix || '(all)'}: ${objects.length} object(s)${res?.isTruncated ? ' (truncated)' : ''}`)
        return {
          objects,
          keys: objects.map(o => o.key),
          count: objects.length,
          truncated: Boolean(res?.isTruncated)
        }
      }
    },
    {
      id: 'presignUrl',
      name: 'Presign a URL',
      description: 'Generates a time-limited signed URL for an object (default GET). Useful to hand a download/upload link to another step or notification.',
      needsConnection: true,
      inputSchema: [
        { key: 'key', label: 'Object key', type: 'string', required: true },
        { key: 'method', label: 'Method', type: 'select', default: 'GET', options: [
          { label: 'GET (download)', value: 'GET' },
          { label: 'PUT (upload)', value: 'PUT' },
          { label: 'HEAD', value: 'HEAD' },
          { label: 'DELETE', value: 'DELETE' }
        ] },
        { key: 'expiresIn', label: 'Expires in (seconds)', type: 'number', default: 3600 }
      ],
      outputKeys: ['url', 'expiresIn'],
      run: async (ctx) => {
        const key = requireKey(ctx)
        const method = String(ctx.input.method ?? 'GET') as 'GET' | 'PUT' | 'HEAD' | 'DELETE'
        const expiresIn = Math.max(1, Number(ctx.input.expiresIn ?? 3600) || 3600)
        const url = client(ctx).presign(key, { method, expiresIn })
        ctx.log(`s3 presign ${method} ${key} (${expiresIn}s)`)
        return { url, expiresIn }
      }
    }
  ]
}
