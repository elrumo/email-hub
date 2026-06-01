import type { Integration, MonitorSnapshot } from '../engine/types'

/**
 * Komga (https://komga.org) — a comic/manga server. Its REST API lives under
 * `/api/v1/...`. Auth is either HTTP Basic (email + password) or, on recent
 * versions, an API key sent as the `X-API-Key` header. We offer both via an
 * auth-method select with `showIf` fields.
 *
 * HTTP integration — no client lifecycle.
 */

function baseUrl(config: Record<string, unknown>): string {
  const raw = String(config.baseUrl ?? '').trim()
  if (!raw) throw new Error('Komga connection has no base URL')
  return raw.replace(/\/+$/, '')
}

function authHeaders(config: Record<string, unknown>): Record<string, string> {
  const method = String(config.authMethod ?? 'apiKey')
  if (method === 'basic') {
    const email = String(config.email ?? '')
    const password = String(config.password ?? '')
    if (!email || !password) throw new Error('Komga connection needs an email and password')
    return { Authorization: `Basic ${btoa(`${email}:${password}`)}` }
  }
  const key = String(config.apiKey ?? '')
  if (!key) throw new Error('Komga connection needs an API key')
  return { 'X-API-Key': key }
}

async function call<T = unknown>(
  config: Record<string, unknown>,
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  signal: AbortSignal
): Promise<T> {
  const res = await fetch(`${baseUrl(config)}/api/v1${path}`, {
    method,
    headers: {
      ...authHeaders(config),
      Accept: 'application/json',
      ...(body != null ? { 'Content-Type': 'application/json' } : {})
    },
    body: body != null ? JSON.stringify(body) : undefined,
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
    if (res.status === 401) throw new Error('Credentials rejected (401)')
    throw new Error(`Komga ${method} ${path} → ${res.status}`)
  }
  return data as T
}

interface Page<T> { content?: T[], totalElements?: number, totalPages?: number }

const TARGET_SCHEMA = [
  { key: 'kind', label: 'Show', type: 'select' as const, default: 'stats', options: [
    { label: 'Stats (libraries, series, books)', value: 'stats' },
    { label: 'Status (up / down)', value: 'status' }
  ] }
]

export const komgaIntegration: Integration = {
  id: 'komga',
  name: 'Komga',
  img: 'https://komga.org/img/logo.svg',
  connectionSchema: [
    {
      key: 'baseUrl',
      label: 'Server URL',
      type: 'string',
      required: true,
      placeholder: 'http://komga.local:25600',
      help: 'Your Komga server URL (with port).'
    },
    {
      key: 'authMethod',
      label: 'Authentication',
      type: 'select',
      default: 'apiKey',
      options: [
        { label: 'API key', value: 'apiKey' },
        { label: 'Email + password', value: 'basic' }
      ]
    },
    { key: 'apiKey', label: 'API key', type: 'secret', help: 'Generate one under Account Settings → API Keys (Komga 1.10+).', showIf: { field: 'authMethod', in: ['apiKey'] } },
    { key: 'email', label: 'Email', type: 'string', placeholder: 'you@example.com', showIf: { field: 'authMethod', in: ['basic'] } },
    { key: 'password', label: 'Password', type: 'secret', showIf: { field: 'authMethod', in: ['basic'] } }
  ],
  testConnection: async (config, signal) => {
    if (!String(config.baseUrl ?? '').trim()) return { ok: false, message: 'Server URL is required' }
    try {
      const me = await call<{ email?: string }>(config, 'GET', '/users/me', null, signal)
      return { ok: true, message: me?.email ? `Connected — ${me.email}` : 'Connected' }
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
          page = await call<Page<unknown>>(cfg, 'GET', '/books?size=1', null, ctx.signal)
        } catch {
          return null
        }
        const total = Number(page?.totalElements ?? 0)
        // first observation establishes a baseline without firing
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
      description: 'Returns the configured Komga libraries.',
      needsConnection: true,
      outputKeys: ['libraries', 'count'],
      inputSchema: [],
      run: async (ctx) => {
        const libraries = await call<unknown[]>(ctx.connection!.config, 'GET', '/libraries', null, ctx.signal) ?? []
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
        { key: 'query', label: 'Query', type: 'string', required: true, placeholder: 'One Piece' },
        { key: 'size', label: 'Max results', type: 'number', default: 20, advanced: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const q = encodeURIComponent(String(ctx.input.query ?? ''))
        const size = Math.max(1, Number(ctx.input.size ?? 20))
        const page = await call<Page<unknown>>(cfg, 'GET', `/series?search=${q}&size=${size}`, null, ctx.signal)
        const series = page?.content ?? []
        ctx.log(`komga search "${ctx.input.query}" → ${series.length} series`)
        return { series, count: series.length }
      }
    },
    {
      id: 'listSeriesBooks',
      name: 'List books in a series',
      description: 'Returns the books (volumes/chapters) of a series by id.',
      needsConnection: true,
      outputKeys: ['books', 'count'],
      inputSchema: [
        { key: 'seriesId', label: 'Series ID', type: 'string', required: true },
        { key: 'size', label: 'Max results', type: 'number', default: 100, advanced: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const seriesId = String(ctx.input.seriesId ?? '').trim()
        if (!seriesId) throw new Error('seriesId is required')
        const size = Math.max(1, Number(ctx.input.size ?? 100))
        const page = await call<Page<unknown>>(cfg, 'GET', `/series/${encodeURIComponent(seriesId)}/books?size=${size}`, null, ctx.signal)
        const books = page?.content ?? []
        return { books, count: books.length }
      }
    },
    {
      id: 'scanLibrary',
      name: 'Scan a library',
      description: 'Triggers a scan of one library by id.',
      needsConnection: true,
      outputKeys: ['triggered', 'libraryId'],
      inputSchema: [
        { key: 'libraryId', label: 'Library ID', type: 'string', required: true, help: 'From "List libraries" → library.id.' }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const libraryId = String(ctx.input.libraryId ?? '').trim()
        if (!libraryId) throw new Error('libraryId is required')
        await call(cfg, 'POST', `/libraries/${encodeURIComponent(libraryId)}/scan`, {}, ctx.signal)
        ctx.log(`komga → scan triggered for library ${libraryId}`)
        return { triggered: true, libraryId }
      }
    },
    {
      id: 'monitorSnapshot',
      name: 'Monitor snapshot',
      description: 'Returns a normalized snapshot for the Monitoring page (library/series/book counts, or up/down).',
      needsConnection: true,
      outputKeys: ['kind', 'state', 'label', 'stats', 'detail', 'raw'],
      inputSchema: TARGET_SCHEMA,
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const wantStatus = String(ctx.input.kind ?? 'stats') === 'status'
        if (wantStatus) {
          try {
            await call(cfg, 'GET', '/users/me', null, ctx.signal)
            const snap: MonitorSnapshot = { kind: 'status', state: 'up', label: 'Up' }
            return snap as unknown as Record<string, unknown>
          } catch (e) {
            const snap: MonitorSnapshot = { kind: 'status', state: 'down', label: 'Down', detail: e instanceof Error ? e.message : undefined }
            return snap as unknown as Record<string, unknown>
          }
        }
        const [libs, series, books] = await Promise.all([
          call<unknown[]>(cfg, 'GET', '/libraries', null, ctx.signal).catch(() => [] as unknown[]),
          call<Page<unknown>>(cfg, 'GET', '/series?size=1', null, ctx.signal).catch(() => ({} as Page<unknown>)),
          call<Page<unknown>>(cfg, 'GET', '/books?size=1', null, ctx.signal).catch(() => ({} as Page<unknown>))
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
