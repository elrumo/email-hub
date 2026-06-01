import type { Integration, MonitorSnapshot } from '../engine/types'

/**
 * Jellyfin (https://jellyfin.org) — and Emby, which shares the same API shape.
 * Auth is an API key created under Dashboard → API Keys, sent as the
 * `X-Emby-Token` header (Jellyfin kept Emby's header name). Docs:
 * https://api.jellyfin.org/.
 *
 * HTTP integration — no client lifecycle, just `fetch` with the token header.
 */

function baseUrl(config: Record<string, unknown>): string {
  const raw = String(config.baseUrl ?? '').trim()
  if (!raw) throw new Error('Jellyfin connection has no base URL')
  return raw.replace(/\/+$/, '')
}

function token(config: Record<string, unknown>): string {
  const t = String(config.apiKey ?? '')
  if (!t) throw new Error('Jellyfin connection has no API key')
  return t
}

async function call<T = unknown>(
  config: Record<string, unknown>,
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  signal: AbortSignal
): Promise<T> {
  const res = await fetch(`${baseUrl(config)}${path}`, {
    method,
    headers: {
      'X-Emby-Token': token(config),
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
    if (res.status === 401) throw new Error('API key rejected (401)')
    throw new Error(`Jellyfin ${method} ${path} → ${res.status}`)
  }
  return data as T
}

interface Session {
  UserName?: string
  DeviceName?: string
  Client?: string
  NowPlayingItem?: { Name?: string, Type?: string, SeriesName?: string }
  PlayState?: { IsPaused?: boolean, PlayMethod?: string }
}

const TARGET_SCHEMA = [
  { key: 'kind', label: 'Show', type: 'select' as const, default: 'stats', options: [
    { label: 'Stats (active streams, library counts)', value: 'stats' },
    { label: 'Status (up / down)', value: 'status' }
  ] }
]

export const jellyfinIntegration: Integration = {
  id: 'jellyfin',
  name: 'Jellyfin',
  img: 'https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/jellyfin-icon.png',
  connectionSchema: [
    {
      key: 'baseUrl',
      label: 'Server URL',
      type: 'string',
      required: true,
      placeholder: 'http://jellyfin.local:8096',
      help: 'Your Jellyfin server URL (with port).'
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'secret',
      required: true,
      help: 'Create one under Dashboard → Advanced → API Keys.'
    }
  ],
  testConnection: async (config, signal) => {
    if (!String(config.baseUrl ?? '').trim()) return { ok: false, message: 'Server URL is required' }
    if (!String(config.apiKey ?? '')) return { ok: false, message: 'API key is required' }
    try {
      const info = await call<{ ServerName?: string, Version?: string }>(config, 'GET', '/System/Info', null, signal)
      const name = info?.ServerName ?? 'Jellyfin'
      return { ok: true, message: info?.Version ? `Connected — ${name} ${info.Version}` : `Connected — ${name}` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not connect' }
    }
  },
  triggers: [
    {
      id: 'playbackActive',
      name: 'When something is playing',
      description:
        'Polls active sessions and fires while one or more are playing media. Fires on every check while playback is active — gate with state to act once. Exposes {{ trigger.count }} and {{ trigger.sessions }}.',
      kind: 'poll',
      needsConnection: true,
      configSchema: [
        { key: 'minStreams', label: 'Minimum active streams', type: 'number', default: 1 }
      ],
      poll: async (ctx) => {
        const cfg = ctx.connection!.config
        let sessions: Session[]
        try {
          sessions = await call<Session[]>(cfg, 'GET', '/Sessions', null, ctx.signal) ?? []
        } catch {
          return null
        }
        const playing = sessions.filter(s => s.NowPlayingItem)
        const min = Number(ctx.config.minStreams ?? 1)
        if (playing.length < min) return null
        return {
          count: playing.length,
          sessions: playing.map(s => ({
            user: s.UserName ?? null,
            client: s.Client ?? null,
            device: s.DeviceName ?? null,
            item: s.NowPlayingItem?.Name ?? null,
            type: s.NowPlayingItem?.Type ?? null,
            paused: s.PlayState?.IsPaused ?? false
          }))
        }
      }
    }
  ],
  actions: [
    {
      id: 'getSessions',
      name: 'Get active sessions',
      description: 'Returns all active client sessions (and what they are playing).',
      needsConnection: true,
      outputKeys: ['sessions', 'count', 'playing'],
      inputSchema: [],
      run: async (ctx) => {
        const sessions = await call<Session[]>(ctx.connection!.config, 'GET', '/Sessions', null, ctx.signal) ?? []
        const playing = sessions.filter(s => s.NowPlayingItem).length
        ctx.log(`jellyfin → ${sessions.length} sessions, ${playing} playing`)
        return { sessions, count: sessions.length, playing }
      }
    },
    {
      id: 'getLibraryCounts',
      name: 'Get library item counts',
      description: 'Returns counts of movies, series, episodes, albums, songs, books etc. across all libraries.',
      needsConnection: true,
      outputKeys: ['counts'],
      inputSchema: [],
      run: async (ctx) => {
        const counts = await call<Record<string, number>>(ctx.connection!.config, 'GET', '/Items/Counts', null, ctx.signal) ?? {}
        return { counts }
      }
    },
    {
      id: 'getUsers',
      name: 'List users',
      description: 'Returns the configured Jellyfin users.',
      needsConnection: true,
      outputKeys: ['users', 'count'],
      inputSchema: [],
      run: async (ctx) => {
        const users = await call<unknown[]>(ctx.connection!.config, 'GET', '/Users', null, ctx.signal) ?? []
        return { users, count: users.length }
      }
    },
    {
      id: 'search',
      name: 'Search the library',
      description: 'Searches all libraries for items matching a term.',
      needsConnection: true,
      outputKeys: ['items', 'count'],
      inputSchema: [
        { key: 'term', label: 'Search term', type: 'string', required: true, placeholder: 'Blade Runner' },
        { key: 'limit', label: 'Max results', type: 'number', default: 25, advanced: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const term = encodeURIComponent(String(ctx.input.term ?? ''))
        const limit = Math.max(1, Number(ctx.input.limit ?? 25))
        const data = await call<{ Items?: unknown[] }>(
          cfg, 'GET', `/Items?searchTerm=${term}&Recursive=true&Limit=${limit}&IncludeItemTypes=Movie,Series,Episode,Audio,Book`, null, ctx.signal
        )
        const items = data?.Items ?? []
        ctx.log(`jellyfin search "${ctx.input.term}" → ${items.length} items`)
        return { items, count: items.length }
      }
    },
    {
      id: 'refreshLibrary',
      name: 'Scan all libraries',
      description: 'Triggers a library scan across all libraries.',
      needsConnection: true,
      outputKeys: ['triggered'],
      inputSchema: [],
      run: async (ctx) => {
        await call(ctx.connection!.config, 'POST', '/Library/Refresh', {}, ctx.signal)
        ctx.log('jellyfin → library scan triggered')
        return { triggered: true }
      }
    },
    {
      id: 'sendMessage',
      name: 'Send a message to a session',
      description: 'Displays a message on a client session (by session id).',
      needsConnection: true,
      outputKeys: ['sent'],
      inputSchema: [
        { key: 'sessionId', label: 'Session ID', type: 'string', required: true, help: 'From "Get active sessions" → session.Id.' },
        { key: 'header', label: 'Header', type: 'string', default: 'Flow Hub' },
        { key: 'text', label: 'Message', type: 'string', required: true },
        { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', default: 5000, advanced: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const sessionId = String(ctx.input.sessionId ?? '').trim()
        if (!sessionId) throw new Error('sessionId is required')
        await call(cfg, 'POST', `/Sessions/${encodeURIComponent(sessionId)}/Message`, {
          Header: String(ctx.input.header ?? 'Flow Hub'),
          Text: String(ctx.input.text ?? ''),
          TimeoutMs: Number(ctx.input.timeoutMs ?? 5000)
        }, ctx.signal)
        ctx.log(`jellyfin → message sent to ${sessionId}`)
        return { sent: true }
      }
    },
    {
      id: 'monitorSnapshot',
      name: 'Monitor snapshot',
      description: 'Returns a normalized snapshot for the Monitoring page (active streams + library totals, or up/down).',
      needsConnection: true,
      outputKeys: ['kind', 'state', 'label', 'stats', 'detail', 'raw'],
      inputSchema: TARGET_SCHEMA,
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const wantStatus = String(ctx.input.kind ?? 'stats') === 'status'
        if (wantStatus) {
          try {
            const info = await call<{ ServerName?: string }>(cfg, 'GET', '/System/Info', null, ctx.signal)
            const snap: MonitorSnapshot = { kind: 'status', state: 'up', label: 'Up', detail: info?.ServerName }
            return snap as unknown as Record<string, unknown>
          } catch (e) {
            const snap: MonitorSnapshot = { kind: 'status', state: 'down', label: 'Down', detail: e instanceof Error ? e.message : undefined }
            return snap as unknown as Record<string, unknown>
          }
        }
        const [sessions, counts] = await Promise.all([
          call<Session[]>(cfg, 'GET', '/Sessions', null, ctx.signal).catch(() => [] as Session[]),
          call<Record<string, number>>(cfg, 'GET', '/Items/Counts', null, ctx.signal).catch(() => ({} as Record<string, number>))
        ])
        const list = sessions ?? []
        const playing = list.filter(s => s.NowPlayingItem)
        const transcodes = playing.filter(s => /transcode/i.test(String(s.PlayState?.PlayMethod ?? ''))).length
        const c = counts ?? {}
        const snap: MonitorSnapshot = {
          kind: 'stats',
          stats: [
            { key: 'streams', label: 'Active streams', icon: 'i-lucide-play', value: playing.length },
            { key: 'transcodes', label: 'Transcodes', icon: 'i-lucide-cpu', value: transcodes },
            { key: 'movies', label: 'Movies', icon: 'i-lucide-film', value: c.MovieCount ?? 0 },
            { key: 'series', label: 'Series', icon: 'i-lucide-tv', value: c.SeriesCount ?? 0 },
            { key: 'episodes', label: 'Episodes', icon: 'i-lucide-clapperboard', value: c.EpisodeCount ?? 0 }
          ],
          detail: playing.length ? playing.map(s => `${s.UserName ?? '?'}: ${s.NowPlayingItem?.Name ?? ''}`).join(' · ') : 'Idle',
          raw: { counts: c, playing: playing.length }
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
