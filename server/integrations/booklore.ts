import type { Integration, MonitorSnapshot } from '../engine/types'

/**
 * BookLore (https://booklore.org) — a self-hosted digital library for ebooks,
 * comics and audiobooks.
 *
 * BookLore's *native* API uses short-lived JWTs and is still evolving, so rather
 * than depend on it we use BookLore's stable, documented integration surface:
 * its **Komga-compatible API**, served at `/komga/api/v1/...`, authenticated with
 * HTTP Basic auth using a BookLore "OPDS / API" account (Settings → OPDS, which
 * also gates the Komga-compatible API and the OPDS catalog). These accounts are
 * separate from the normal web login. Because the endpoints mirror Komga, the
 * shapes here match the Komga integration.
 *
 * HTTP integration — no client lifecycle.
 */

function baseUrl(config: Record<string, unknown>): string {
  const raw = String(config.baseUrl ?? '').trim()
  if (!raw) throw new Error('BookLore connection has no base URL')
  return raw.replace(/\/+$/, '')
}

function authHeader(config: Record<string, unknown>): Record<string, string> {
  const username = String(config.username ?? '')
  const password = String(config.password ?? '')
  if (!username || !password) throw new Error('BookLore connection needs an OPDS/API username and password')
  return { Authorization: `Basic ${btoa(`${username}:${password}`)}` }
}

/** Call a Komga-compatible endpoint (path is relative to /komga/api/v1). */
async function call<T = unknown>(
  config: Record<string, unknown>,
  path: string,
  signal: AbortSignal
): Promise<T> {
  const res = await fetch(`${baseUrl(config)}/komga/api/v1${path}`, {
    method: 'GET',
    headers: { ...authHeader(config), Accept: 'application/json' },
    signal
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error('OPDS/API credentials rejected (401)')
    throw new Error(`BookLore ${path} → ${res.status}`)
  }
  return data as T
}

interface Page<T> { content?: T[], totalElements?: number }

const TARGET_SCHEMA = [
  { key: 'kind', label: 'Show', type: 'select' as const, default: 'stats', options: [
    { label: 'Stats (series, books)', value: 'stats' },
    { label: 'Status (up / down)', value: 'status' }
  ] }
]

export const bookloreIntegration: Integration = {
  id: 'booklore',
  name: 'BookLore',
  img: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/booklore.png',
  connectionSchema: [
    {
      key: 'baseUrl',
      label: 'Server URL',
      type: 'string',
      required: true,
      placeholder: 'http://booklore.local:6060',
      help: 'Your BookLore server URL (with port). The Komga-compatible API at /komga/api is used.'
    },
    {
      key: 'username',
      label: 'OPDS / API username',
      type: 'string',
      required: true,
      help: 'A BookLore OPDS account username (Settings → OPDS). These are separate from your web login and also authorize the Komga-compatible API.'
    },
    { key: 'password', label: 'OPDS / API password', type: 'secret', required: true }
  ],
  testConnection: async (config, signal) => {
    if (!String(config.baseUrl ?? '').trim()) return { ok: false, message: 'Server URL is required' }
    try {
      // Any authorized 200 from the Komga-compatible API confirms reachability + creds.
      await call(config, '/libraries', signal)
      return { ok: true, message: 'Connected — Komga-compatible API reachable' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not connect' }
    }
  },
  triggers: [
    {
      id: 'newBooks',
      name: 'When the book count grows',
      description:
        'Polls the total book count and fires when it has increased since the last check (a proxy for "new books added"). Exposes {{ trigger.total }} and {{ trigger.added }}.',
      kind: 'poll',
      needsConnection: true,
      configSchema: [],
      poll: async (ctx) => {
        const cfg = ctx.connection!.config
        let page: Page<unknown>
        try {
          page = await call<Page<unknown>>(cfg, '/books?size=1', ctx.signal)
        } catch {
          return null
        }
        const total = Number(page?.totalElements ?? 0)
        const prev = lastBookCount.get(ctx.connection!.id)
        lastBookCount.set(ctx.connection!.id, total)
        if (prev == null || total <= prev) return null
        return { total, added: total - prev }
      }
    }
  ],
  actions: [
    {
      id: 'listLibraries',
      name: 'List libraries',
      description: 'Returns the libraries exposed via the Komga-compatible API.',
      needsConnection: true,
      outputKeys: ['libraries', 'count'],
      inputSchema: [],
      run: async (ctx) => {
        const libraries = await call<unknown[]>(ctx.connection!.config, '/libraries', ctx.signal) ?? []
        return { libraries, count: libraries.length }
      }
    },
    {
      id: 'searchSeries',
      name: 'Search series',
      description: 'Searches series by name.',
      needsConnection: true,
      outputKeys: ['series', 'count'],
      inputSchema: [
        { key: 'query', label: 'Query', type: 'string', required: true, placeholder: 'Dune' },
        { key: 'size', label: 'Max results', type: 'number', default: 20, advanced: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const q = encodeURIComponent(String(ctx.input.query ?? ''))
        const size = Math.max(1, Number(ctx.input.size ?? 20))
        const page = await call<Page<unknown>>(cfg, `/series?search=${q}&size=${size}`, ctx.signal)
        const series = page?.content ?? []
        ctx.log(`booklore search "${ctx.input.query}" → ${series.length} series`)
        return { series, count: series.length }
      }
    },
    {
      id: 'listBooks',
      name: 'List books',
      description: 'Returns books (newest first), optionally filtered by search term.',
      needsConnection: true,
      outputKeys: ['books', 'count', 'total'],
      inputSchema: [
        { key: 'query', label: 'Search term', type: 'string', placeholder: 'optional', advanced: true },
        { key: 'size', label: 'Max results', type: 'number', default: 50, advanced: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const size = Math.max(1, Number(ctx.input.size ?? 50))
        const q = String(ctx.input.query ?? '').trim()
        const qs = q ? `search=${encodeURIComponent(q)}&size=${size}` : `size=${size}&sort=createdDate,desc`
        const page = await call<Page<unknown>>(cfg, `/books?${qs}`, ctx.signal)
        const books = page?.content ?? []
        return { books, count: books.length, total: page?.totalElements ?? books.length }
      }
    },
    {
      id: 'monitorSnapshot',
      name: 'Monitor snapshot',
      description: 'Returns a normalized snapshot for the Monitoring page (series/book counts, or up/down).',
      needsConnection: true,
      outputKeys: ['kind', 'state', 'label', 'stats', 'detail', 'raw'],
      inputSchema: TARGET_SCHEMA,
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const wantStatus = String(ctx.input.kind ?? 'stats') === 'status'
        if (wantStatus) {
          try {
            await call(cfg, '/libraries', ctx.signal)
            const snap: MonitorSnapshot = { kind: 'status', state: 'up', label: 'Up' }
            return snap as unknown as Record<string, unknown>
          } catch (e) {
            const snap: MonitorSnapshot = { kind: 'status', state: 'down', label: 'Down', detail: e instanceof Error ? e.message : undefined }
            return snap as unknown as Record<string, unknown>
          }
        }
        const [libs, series, books] = await Promise.all([
          call<unknown[]>(cfg, '/libraries', ctx.signal).catch(() => [] as unknown[]),
          call<Page<unknown>>(cfg, '/series?size=1', ctx.signal).catch(() => ({} as Page<unknown>)),
          call<Page<unknown>>(cfg, '/books?size=1', ctx.signal).catch(() => ({} as Page<unknown>))
        ])
        const snap: MonitorSnapshot = {
          kind: 'stats',
          stats: [
            { key: 'libraries', label: 'Libraries', icon: 'i-lucide-library', value: (libs ?? []).length },
            { key: 'series', label: 'Series', icon: 'i-lucide-book-copy', value: series?.totalElements ?? 0 },
            { key: 'books', label: 'Books', icon: 'i-lucide-book', value: books?.totalElements ?? 0 }
          ],
          raw: { libraries: (libs ?? []).length, series: series?.totalElements, books: books?.totalElements }
        }
        return snap as unknown as Record<string, unknown>
      }
    }
  ],
  monitoring: {
    kind: 'stats',
    snapshotAction: 'monitorSnapshot',
    targetSchema: TARGET_SCHEMA
  }
}

// Per-connection baseline for the "book count grew" trigger. Best-effort, in
// process — a restart simply re-establishes the baseline on the next poll.
const lastBookCount = new Map<string, number>()
