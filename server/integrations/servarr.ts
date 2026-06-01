import type { Integration, MonitorSnapshot } from '../engine/types'

/**
 * Servarr — the *arr family (Radarr, Sonarr, Lidarr, Readarr, Prowlarr, Bazarr).
 * They share a near-identical HTTP API: a base URL + an `X-Api-Key` header, and
 * (for the v3 apps) endpoints under `/api/v3/...`. Rather than ship six almost
 * identical integrations we use ONE integration with a `provider` select on the
 * connection (like the AI integration). `showIf` then tailors only the bits that
 * actually differ between apps; everything else is shared.
 *
 * HTTP integration — no client lifecycle, just `fetch` with the api key header.
 *
 * API surface used:
 *  - Radarr/Sonarr/Lidarr/Readarr (v3): /api/v3/system/status, /queue, /health,
 *    /command, /wanted/missing, and the per-app library list (/movie, /series,
 *    /artist, /book) + lookup search.
 *  - Prowlarr (v1): /api/v1/system/status, /health, /indexer, /command.
 *  - Bazarr: /api/system/status, /api/system/health, /api/episodes/wanted,
 *    /api/movies/wanted.
 */

type Provider = 'radarr' | 'sonarr' | 'lidarr' | 'readarr' | 'prowlarr' | 'bazarr'

const PROVIDER_OPTIONS = [
  { label: 'Radarr (movies)', value: 'radarr', icon: 'i-simple-icons-radarr' },
  { label: 'Sonarr (TV)', value: 'sonarr', icon: 'i-simple-icons-sonarr' },
  { label: 'Lidarr (music)', value: 'lidarr', icon: 'i-simple-icons-lidarr' },
  { label: 'Readarr (books)', value: 'readarr', icon: 'i-simple-icons-readarr' },
  { label: 'Prowlarr (indexers)', value: 'prowlarr', icon: 'i-simple-icons-prowlarr' },
  { label: 'Bazarr (subtitles)', value: 'bazarr', icon: 'i-simple-icons-bazarr' }
]

/** API version prefix per provider. Bazarr is un-versioned (`/api`). */
function apiBase(provider: Provider): string {
  if (provider === 'prowlarr') return '/api/v1'
  if (provider === 'bazarr') return '/api'
  return '/api/v3'
}

/** The library list endpoint + a friendly noun, per v3 app. */
const LIBRARY: Record<string, { path: string, noun: string }> = {
  radarr: { path: '/movie', noun: 'movies' },
  sonarr: { path: '/series', noun: 'series' },
  lidarr: { path: '/artist', noun: 'artists' },
  readarr: { path: '/book', noun: 'books' }
}

function providerOf(config: Record<string, unknown>): Provider {
  const p = String(config.provider ?? 'radarr') as Provider
  return PROVIDER_OPTIONS.some(o => o.value === p) ? p : 'radarr'
}

function baseUrl(config: Record<string, unknown>): string {
  const raw = String(config.baseUrl ?? '').trim()
  if (!raw) throw new Error('Servarr connection has no base URL')
  return raw.replace(/\/+$/, '')
}

function apiKey(config: Record<string, unknown>): string {
  const k = String(config.apiKey ?? '')
  if (!k) throw new Error('Servarr connection has no API key')
  return k
}

async function call<T = unknown>(
  config: Record<string, unknown>,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  signal: AbortSignal
): Promise<{ status: number, data: T }> {
  const url = `${baseUrl(config)}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'X-Api-Key': apiKey(config),
      'Accept': 'application/json',
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
    const msg = (data && typeof data === 'object' && 'message' in data)
      ? String((data as { message?: unknown }).message)
      : `${method} ${path} → ${res.status}`
    throw new Error(res.status === 401 ? 'API key rejected (401)' : msg)
  }
  return { status: res.status, data: data as T }
}

/** Queue endpoint differs slightly — v3 apps page it, Bazarr has no queue. */
async function fetchQueue(config: Record<string, unknown>, signal: AbortSignal): Promise<unknown[]> {
  const provider = providerOf(config)
  if (provider === 'bazarr' || provider === 'prowlarr') return []
  const { data } = await call<{ records?: unknown[] } | unknown[]>(
    config, 'GET', `${apiBase(provider)}/queue?pageSize=1000`, null, signal
  )
  if (Array.isArray(data)) return data
  return Array.isArray(data?.records) ? data.records : []
}

/** Count of wanted/missing items, per provider. Returns null if unsupported. */
async function fetchMissingCount(config: Record<string, unknown>, signal: AbortSignal): Promise<number | null> {
  const provider = providerOf(config)
  try {
    if (provider === 'bazarr') {
      const [eps, movies] = await Promise.all([
        call<{ total?: number, data?: unknown[] }>(config, 'GET', '/api/episodes/wanted', null, signal).catch(() => null),
        call<{ total?: number, data?: unknown[] }>(config, 'GET', '/api/movies/wanted', null, signal).catch(() => null)
      ])
      const a = eps?.data?.total ?? (Array.isArray(eps?.data?.data) ? eps!.data!.data!.length : 0)
      const b = movies?.data?.total ?? (Array.isArray(movies?.data?.data) ? movies!.data!.data!.length : 0)
      return Number(a) + Number(b)
    }
    if (provider === 'prowlarr') return null
    const { data } = await call<{ totalRecords?: number }>(
      config, 'GET', `${apiBase(provider)}/wanted/missing?pageSize=1`, null, signal
    )
    return typeof data?.totalRecords === 'number' ? data.totalRecords : null
  } catch {
    return null
  }
}

async function fetchHealth(config: Record<string, unknown>, signal: AbortSignal): Promise<unknown[]> {
  const provider = providerOf(config)
  const path = provider === 'bazarr' ? '/api/system/health' : `${apiBase(provider)}/health`
  try {
    const { data } = await call<unknown>(config, 'GET', path, null, signal)
    if (Array.isArray(data)) return data
    // Bazarr wraps it as { data: [...] }
    if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown[] }).data)) {
      return (data as { data: unknown[] }).data
    }
    return []
  } catch {
    return []
  }
}

const TARGET_SCHEMA = [
  { key: 'kind', label: 'Show', type: 'select' as const, default: 'stats', options: [
    { label: 'Stats (queue, missing, health)', value: 'stats' },
    { label: 'Status (up / down)', value: 'status' }
  ] }
]

export const servarrIntegration: Integration = {
  id: 'servarr',
  name: 'Servarr (Radarr / Sonarr / …)',
  img: 'https://avatars.githubusercontent.com/u/57051827?s=200&v=4',
  connectionSchema: [
    {
      key: 'provider',
      label: 'App',
      type: 'select',
      required: true,
      default: 'radarr',
      options: PROVIDER_OPTIONS,
      help: 'Which *arr app this connection points at. They share an API; this tailors the endpoints used.'
    },
    {
      key: 'baseUrl',
      label: 'URL',
      type: 'string',
      required: true,
      placeholder: 'http://radarr.local:7878',
      help: 'Base URL of the app (include the port). No trailing /api.'
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'secret',
      required: true,
      help: 'Found in the app under Settings → General → Security → API Key.'
    }
  ],
  testConnection: async (config, signal) => {
    if (!String(config.baseUrl ?? '').trim()) return { ok: false, message: 'URL is required' }
    if (!String(config.apiKey ?? '')) return { ok: false, message: 'API key is required' }
    const provider = providerOf(config)
    const statusPath = provider === 'bazarr' ? '/api/system/status' : `${apiBase(provider)}/system/status`
    try {
      const { data } = await call<{ version?: string, data?: { radarr_version?: string } }>(config, 'GET', statusPath, null, signal)
      const version = data?.version ?? data?.data?.radarr_version
      const label = PROVIDER_OPTIONS.find(o => o.value === provider)?.label ?? provider
      return { ok: true, message: version ? `Connected — ${label} ${version}` : `Connected — ${label}` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not connect' }
    }
  },
  triggers: [
    {
      id: 'queueChanged',
      name: 'When the download queue has items',
      description:
        'Polls the download queue and fires while it is non-empty (or, with the test flipped, while it is empty). Fires on EVERY check while the test passes — add a state cooldown gate in the flow to act once. Exposes {{ trigger.count }} and {{ trigger.items }}.',
      kind: 'poll',
      needsConnection: true,
      configSchema: [
        { key: 'fireWhen', label: 'Fires when the queue…', type: 'select', default: 'nonEmpty', options: [
          { label: 'has items', value: 'nonEmpty' },
          { label: 'is empty', value: 'empty' }
        ] }
      ],
      poll: async (ctx) => {
        const cfg = ctx.connection!.config
        let items: unknown[]
        try {
          items = await fetchQueue(cfg, ctx.signal)
        } catch {
          return null
        }
        const nonEmpty = items.length > 0
        const want = String(ctx.config.fireWhen ?? 'nonEmpty') === 'nonEmpty'
        if (nonEmpty !== want) return null
        return { count: items.length, items }
      }
    },
    {
      id: 'healthIssue',
      name: 'When there is a health issue',
      description:
        'Polls the app\'s health checks and fires while one or more issues are present. Fires on every check while issues exist — gate with state if you want one alert. Exposes {{ trigger.count }} and {{ trigger.issues }}.',
      kind: 'poll',
      needsConnection: true,
      configSchema: [
        { key: 'minType', label: 'Minimum severity', type: 'select', default: 'warning', options: [
          { label: 'Notice and above', value: 'notice' },
          { label: 'Warning and above', value: 'warning' },
          { label: 'Error only', value: 'error' }
        ] }
      ],
      poll: async (ctx) => {
        const cfg = ctx.connection!.config
        const issues = await fetchHealth(cfg, ctx.signal)
        const rank: Record<string, number> = { notice: 0, warning: 1, error: 2 }
        const min = rank[String(ctx.config.minType ?? 'warning')] ?? 1
        const filtered = issues.filter((i) => {
          const t = String((i as { type?: string }).type ?? 'warning').toLowerCase()
          return (rank[t] ?? 1) >= min
        })
        if (filtered.length === 0) return null
        return { count: filtered.length, issues: filtered }
      }
    }
  ],
  actions: [
    {
      id: 'systemStatus',
      name: 'Get system status',
      description: 'Returns version and system info for the app.',
      needsConnection: true,
      outputKeys: ['version', 'status'],
      inputSchema: [],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const provider = providerOf(cfg)
        const path = provider === 'bazarr' ? '/api/system/status' : `${apiBase(provider)}/system/status`
        const { data } = await call<Record<string, unknown>>(cfg, 'GET', path, null, ctx.signal)
        return { version: (data as { version?: string }).version ?? null, status: data }
      }
    },
    {
      id: 'getQueue',
      name: 'Get download queue',
      description: 'Returns the current download/import queue (not supported on Prowlarr/Bazarr — returns empty).',
      needsConnection: true,
      outputKeys: ['items', 'count'],
      inputSchema: [],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const items = await fetchQueue(cfg, ctx.signal)
        ctx.log(`servarr queue → ${items.length} items`)
        return { items, count: items.length }
      }
    },
    {
      id: 'getHealth',
      name: 'Get health issues',
      description: 'Returns the current health-check warnings/errors.',
      needsConnection: true,
      outputKeys: ['issues', 'count'],
      inputSchema: [],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const issues = await fetchHealth(cfg, ctx.signal)
        return { issues, count: issues.length }
      }
    },
    {
      id: 'getLibrary',
      name: 'List library items',
      description: 'Lists everything in the library — movies (Radarr), series (Sonarr), artists (Lidarr) or books (Readarr). Not for Prowlarr/Bazarr.',
      needsConnection: true,
      outputKeys: ['items', 'count', 'noun'],
      inputSchema: [],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const provider = providerOf(cfg)
        const lib = LIBRARY[provider]
        if (!lib) throw new Error(`${provider} has no library list`)
        const { data } = await call<unknown[]>(cfg, 'GET', `${apiBase(provider)}${lib.path}`, null, ctx.signal)
        const items = Array.isArray(data) ? data : []
        ctx.log(`servarr library → ${items.length} ${lib.noun}`)
        return { items, count: items.length, noun: lib.noun }
      }
    },
    {
      id: 'lookup',
      name: 'Search (lookup)',
      description: 'Searches for something to add — a movie, series, artist or book — by term. Returns lookup results you can pass to "Add to library".',
      needsConnection: true,
      outputKeys: ['results', 'count'],
      inputSchema: [
        { key: 'term', label: 'Search term', type: 'string', required: true, placeholder: 'The Matrix' }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const provider = providerOf(cfg)
        const lib = LIBRARY[provider]
        if (!lib) throw new Error(`${provider} does not support lookup`)
        const term = encodeURIComponent(String(ctx.input.term ?? ''))
        const { data } = await call<unknown[]>(cfg, 'GET', `${apiBase(provider)}${lib.path}/lookup?term=${term}`, null, ctx.signal)
        const results = Array.isArray(data) ? data : []
        ctx.log(`servarr lookup "${ctx.input.term}" → ${results.length} results`)
        return { results, count: results.length }
      }
    },
    {
      id: 'runCommand',
      name: 'Run a command',
      description: 'Triggers a command by name, e.g. RefreshMonitoredDownloads, MissingEpisodeSearch, RssSync, ApplicationUpdate. Extra params can be supplied as key/value pairs.',
      needsConnection: true,
      outputKeys: ['id', 'name', 'status'],
      inputSchema: [
        { key: 'name', label: 'Command name', type: 'string', required: true, placeholder: 'RssSync' },
        { key: 'params', label: 'Extra parameters', type: 'keyValue', help: 'Optional key/value pairs merged into the command body (e.g. movieIds=1,2).' }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const provider = providerOf(cfg)
        if (provider === 'bazarr') throw new Error('Bazarr has no command endpoint')
        const name = String(ctx.input.name ?? '').trim()
        if (!name) throw new Error('Command name is required')
        const extra = (ctx.input.params && typeof ctx.input.params === 'object') ? ctx.input.params as Record<string, unknown> : {}
        const { data } = await call<{ id?: number, name?: string, status?: string }>(
          cfg, 'POST', `${apiBase(provider)}/command`, { name, ...extra }, ctx.signal
        )
        ctx.log(`servarr command ${name} → #${data?.id ?? '?'}`)
        return { id: data?.id ?? null, name: data?.name ?? name, status: data?.status ?? null }
      }
    },
    {
      id: 'getIndexers',
      name: 'List indexers (Prowlarr)',
      description: 'Lists configured indexers. Prowlarr only.',
      needsConnection: true,
      outputKeys: ['indexers', 'count'],
      inputSchema: [],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        if (providerOf(cfg) !== 'prowlarr') throw new Error('Indexers are only listed on Prowlarr')
        const { data } = await call<unknown[]>(cfg, 'GET', '/api/v1/indexer', null, ctx.signal)
        const indexers = Array.isArray(data) ? data : []
        return { indexers, count: indexers.length }
      }
    },
    {
      // Powers the Monitoring page. Returns a MonitorSnapshot — "status" when the
      // monitor's kind=status, otherwise "stats" (queue/missing/health counts).
      id: 'monitorSnapshot',
      name: 'Monitor snapshot',
      description: 'Returns a normalized snapshot for the Monitoring page.',
      needsConnection: true,
      outputKeys: ['kind', 'state', 'label', 'stats', 'detail', 'raw'],
      inputSchema: TARGET_SCHEMA,
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const provider = providerOf(cfg)
        const label = PROVIDER_OPTIONS.find(o => o.value === provider)?.label ?? provider
        const statusPath = provider === 'bazarr' ? '/api/system/status' : `${apiBase(provider)}/system/status`
        const wantStatus = String(ctx.input.kind ?? 'stats') === 'status'

        if (wantStatus) {
          try {
            await call(cfg, 'GET', statusPath, null, ctx.signal)
            const snap: MonitorSnapshot = { kind: 'status', state: 'up', label: 'Up', detail: label }
            return snap as unknown as Record<string, unknown>
          } catch (e) {
            const snap: MonitorSnapshot = { kind: 'status', state: 'down', label: 'Down', detail: e instanceof Error ? e.message : label }
            return snap as unknown as Record<string, unknown>
          }
        }

        const [queue, missing, health] = await Promise.all([
          fetchQueue(cfg, ctx.signal).catch(() => [] as unknown[]),
          fetchMissingCount(cfg, ctx.signal),
          fetchHealth(cfg, ctx.signal)
        ])
        const stats: Array<{ key: string, label: string, icon?: string, value: number | string | null, unit?: string }> = [
          { key: 'queue', label: 'Queue', icon: 'i-lucide-download', value: queue.length },
          { key: 'health', label: 'Health issues', icon: 'i-lucide-heart-pulse', value: health.length }
        ]
        if (missing != null) stats.unshift({ key: 'missing', label: 'Missing', icon: 'i-lucide-circle-help', value: missing })
        const snap: MonitorSnapshot = { kind: 'stats', stats, detail: label, raw: { queue: queue.length, missing, health: health.length } }
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
