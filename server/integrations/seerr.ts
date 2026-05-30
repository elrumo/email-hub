import type { Integration, MonitorSnapshot } from '../engine/types'

/**
 * Seerr — Overseerr (https://overseerr.dev) and its fork Jellyseerr, which share
 * an identical REST API: a base URL + an `X-Api-Key` header, endpoints under
 * `/api/v1/...`. One integration with a cosmetic `provider` select (it only
 * changes the label/icon; the API is the same).
 *
 * HTTP integration — no client lifecycle.
 */

const PROVIDER_OPTIONS = [
  { label: 'Overseerr', value: 'overseerr', icon: 'i-simple-icons-overseerr' },
  { label: 'Jellyseerr', value: 'jellyseerr', icon: 'i-simple-icons-jellyfin' }
]

function baseUrl(config: Record<string, unknown>): string {
  const raw = String(config.baseUrl ?? '').trim()
  if (!raw) throw new Error('Seerr connection has no base URL')
  return raw.replace(/\/+$/, '')
}

function apiKey(config: Record<string, unknown>): string {
  const k = String(config.apiKey ?? '')
  if (!k) throw new Error('Seerr connection has no API key')
  return k
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
    if (res.status === 401 || res.status === 403) throw new Error('API key rejected')
    const msg = (data && typeof data === 'object' && 'message' in data) ? String((data as { message?: unknown }).message) : `${method} ${path} → ${res.status}`
    throw new Error(msg)
  }
  return data as T
}

interface RequestCount {
  total?: number
  movie?: number
  tv?: number
  pending?: number
  approved?: number
  declined?: number
  processing?: number
  available?: number
}

const STATUS_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Pending approval', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Processing', value: 'processing' },
  { label: 'Available', value: 'available' },
  { label: 'Unavailable', value: 'unavailable' },
  { label: 'Failed', value: 'failed' }
]

const TARGET_SCHEMA = [
  { key: 'kind', label: 'Show', type: 'select' as const, default: 'stats', options: [
    { label: 'Stats (request counts)', value: 'stats' },
    { label: 'Status (up / down)', value: 'status' }
  ] }
]

export const seerrIntegration: Integration = {
  id: 'seerr',
  name: 'Overseerr / Jellyseerr',
  icon: 'i-simple-icons-overseerr',
  connectionSchema: [
    {
      key: 'provider',
      label: 'App',
      type: 'select',
      default: 'overseerr',
      options: PROVIDER_OPTIONS,
      help: 'Cosmetic — Overseerr and Jellyseerr share the same API.'
    },
    {
      key: 'baseUrl',
      label: 'URL',
      type: 'string',
      required: true,
      placeholder: 'http://overseerr.local:5055',
      help: 'Base URL (with port). No trailing /api.'
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'secret',
      required: true,
      help: 'Found under Settings → General → API Key.'
    }
  ],
  testConnection: async (config, signal) => {
    if (!String(config.baseUrl ?? '').trim()) return { ok: false, message: 'URL is required' }
    if (!String(config.apiKey ?? '')) return { ok: false, message: 'API key is required' }
    try {
      const status = await call<{ version?: string }>(config, 'GET', '/status', null, signal)
      return { ok: true, message: status?.version ? `Connected — v${status.version}` : 'Connected' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not connect' }
    }
  },
  triggers: [
    {
      id: 'pendingRequests',
      name: 'When there are pending requests',
      description:
        'Polls the request count and fires while pending (awaiting-approval) requests are at or above a threshold. Fires on every check while the test passes — gate with state to act once. Exposes {{ trigger.pending }} and the full {{ trigger.counts }}.',
      kind: 'poll',
      needsConnection: true,
      configSchema: [
        { key: 'minPending', label: 'Minimum pending to fire', type: 'number', default: 1 }
      ],
      poll: async (ctx) => {
        const cfg = ctx.connection!.config
        let counts: RequestCount
        try {
          counts = await call<RequestCount>(cfg, 'GET', '/request/count', null, ctx.signal)
        } catch {
          return null
        }
        const pending = Number(counts?.pending ?? 0)
        if (pending < Number(ctx.config.minPending ?? 1)) return null
        return { pending, counts }
      }
    }
  ],
  actions: [
    {
      id: 'getRequestCounts',
      name: 'Get request counts',
      description: 'Returns totals by status: pending, approved, processing, available, declined.',
      needsConnection: true,
      outputKeys: ['counts'],
      inputSchema: [],
      run: async (ctx) => {
        const counts = await call<RequestCount>(ctx.connection!.config, 'GET', '/request/count', null, ctx.signal)
        return { counts }
      }
    },
    {
      id: 'listRequests',
      name: 'List requests',
      description: 'Returns media requests, optionally filtered by status.',
      needsConnection: true,
      outputKeys: ['requests', 'count'],
      inputSchema: [
        { key: 'filter', label: 'Status filter', type: 'select', default: 'all', options: STATUS_FILTERS },
        { key: 'take', label: 'Max results', type: 'number', default: 20, advanced: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const filter = String(ctx.input.filter ?? 'all')
        const take = Math.max(1, Number(ctx.input.take ?? 20))
        const data = await call<{ results?: unknown[] }>(cfg, 'GET', `/request?filter=${encodeURIComponent(filter)}&take=${take}&sort=added`, null, ctx.signal)
        const requests = data?.results ?? []
        ctx.log(`seerr → ${requests.length} ${filter} requests`)
        return { requests, count: requests.length }
      }
    },
    {
      id: 'approveRequest',
      name: 'Approve a request',
      description: 'Approves a pending request by id.',
      needsConnection: true,
      outputKeys: ['id', 'status'],
      inputSchema: [
        { key: 'requestId', label: 'Request ID', type: 'number', required: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const id = Number(ctx.input.requestId)
        if (!id) throw new Error('requestId is required')
        const data = await call<{ id?: number, status?: number }>(cfg, 'POST', `/request/${id}/approve`, {}, ctx.signal)
        ctx.log(`seerr → approved request ${id}`)
        return { id, status: data?.status ?? null }
      }
    },
    {
      id: 'declineRequest',
      name: 'Decline a request',
      description: 'Declines a pending request by id.',
      needsConnection: true,
      outputKeys: ['id', 'status'],
      inputSchema: [
        { key: 'requestId', label: 'Request ID', type: 'number', required: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const id = Number(ctx.input.requestId)
        if (!id) throw new Error('requestId is required')
        const data = await call<{ id?: number, status?: number }>(cfg, 'POST', `/request/${id}/decline`, {}, ctx.signal)
        ctx.log(`seerr → declined request ${id}`)
        return { id, status: data?.status ?? null }
      }
    },
    {
      id: 'search',
      name: 'Search for media',
      description: 'Searches TMDB (movies/TV/people) as Overseerr does on its discover page.',
      needsConnection: true,
      outputKeys: ['results', 'count'],
      inputSchema: [
        { key: 'query', label: 'Query', type: 'string', required: true, placeholder: 'Dune' }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const q = encodeURIComponent(String(ctx.input.query ?? ''))
        const data = await call<{ results?: unknown[] }>(cfg, 'GET', `/search?query=${q}`, null, ctx.signal)
        const results = data?.results ?? []
        ctx.log(`seerr search "${ctx.input.query}" → ${results.length} results`)
        return { results, count: results.length }
      }
    },
    {
      id: 'createRequest',
      name: 'Request media',
      description: 'Creates a new request for a movie or TV show by TMDB id.',
      needsConnection: true,
      outputKeys: ['id', 'status'],
      inputSchema: [
        { key: 'mediaType', label: 'Media type', type: 'select', required: true, options: [
          { label: 'Movie', value: 'movie' },
          { label: 'TV', value: 'tv' }
        ] },
        { key: 'mediaId', label: 'TMDB ID', type: 'number', required: true, help: 'The TMDB id (from "Search for media" → result.id).' },
        { key: 'seasons', label: 'Seasons (TV)', type: 'string', placeholder: 'all', help: 'For TV: "all" or comma-separated season numbers.', showIf: { field: 'mediaType', in: ['tv'] } }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const mediaType = String(ctx.input.mediaType ?? 'movie')
        const mediaId = Number(ctx.input.mediaId)
        if (!mediaId) throw new Error('mediaId is required')
        const body: Record<string, unknown> = { mediaType, mediaId }
        if (mediaType === 'tv') {
          const raw = String(ctx.input.seasons ?? 'all').trim()
          body.seasons = raw === 'all' || raw === '' ? 'all' : raw.split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n))
        }
        const data = await call<{ id?: number, status?: number }>(cfg, 'POST', '/request', body, ctx.signal)
        ctx.log(`seerr → requested ${mediaType} ${mediaId}`)
        return { id: data?.id ?? null, status: data?.status ?? null }
      }
    },
    {
      id: 'monitorSnapshot',
      name: 'Monitor snapshot',
      description: 'Returns a normalized snapshot for the Monitoring page (request counts, or up/down).',
      needsConnection: true,
      outputKeys: ['kind', 'state', 'label', 'stats', 'detail', 'raw'],
      inputSchema: TARGET_SCHEMA,
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const wantStatus = String(ctx.input.kind ?? 'stats') === 'status'
        if (wantStatus) {
          try {
            await call(cfg, 'GET', '/status', null, ctx.signal)
            const snap: MonitorSnapshot = { kind: 'status', state: 'up', label: 'Up' }
            return snap as unknown as Record<string, unknown>
          } catch (e) {
            const snap: MonitorSnapshot = { kind: 'status', state: 'down', label: 'Down', detail: e instanceof Error ? e.message : undefined }
            return snap as unknown as Record<string, unknown>
          }
        }
        const counts = await call<RequestCount>(cfg, 'GET', '/request/count', null, ctx.signal).catch(() => ({} as RequestCount))
        const c = counts ?? {}
        const snap: MonitorSnapshot = {
          kind: 'stats',
          stats: [
            { key: 'pending', label: 'Pending', icon: 'i-lucide-clock', value: c.pending ?? 0 },
            { key: 'processing', label: 'Processing', icon: 'i-lucide-loader', value: c.processing ?? 0 },
            { key: 'available', label: 'Available', icon: 'i-lucide-circle-check', value: c.available ?? 0 },
            { key: 'total', label: 'Total', icon: 'i-lucide-inbox', value: c.total ?? 0 }
          ],
          detail: `${c.movie ?? 0} movies · ${c.tv ?? 0} TV`,
          raw: c
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
