import type { Integration, MonitorSnapshot } from '../engine/types'

/**
 * qBittorrent — via its WebUI API v2 (https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)).
 * Auth is cookie-based: POST /api/v2/auth/login with username/password returns a
 * `SID` cookie that authorizes subsequent calls. There's no API key.
 *
 * HTTP integration (no client factory) — but because every call needs the SID
 * cookie, we keep a tiny in-process cache of {baseUrl+user → SID} and re-login
 * transparently on a 403. The cache is best-effort: it just saves a login round
 * trip; a cold start or expired SID simply re-authenticates.
 */

interface Session { sid: string }

// keyed by `${baseUrl}|${username}` — value is the last good SID
const sessions = new Map<string, Session>()

function baseUrl(config: Record<string, unknown>): string {
  const raw = String(config.baseUrl ?? '').trim()
  if (!raw) throw new Error('qBittorrent connection has no base URL')
  return raw.replace(/\/+$/, '')
}

function sessionKey(config: Record<string, unknown>): string {
  return `${baseUrl(config)}|${String(config.username ?? '')}`
}

async function login(config: Record<string, unknown>, signal: AbortSignal): Promise<string> {
  const base = baseUrl(config)
  const username = String(config.username ?? '')
  const password = String(config.password ?? '')
  const form = new URLSearchParams({ username, password })
  const res = await fetch(`${base}/api/v2/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // qBittorrent rejects logins whose Referer host doesn't match unless
      // host-header checks are disabled; sending the base URL satisfies it.
      'Referer': base,
      'Origin': base
    },
    body: form.toString(),
    signal
  })
  if (res.status === 403) throw new Error('Login banned — too many failed attempts (qBittorrent temporary IP ban)')
  const text = await res.text()
  if (!res.ok || text.trim() !== 'Ok.') {
    throw new Error('qBittorrent login failed — check username/password')
  }
  // SID arrives in Set-Cookie: SID=...
  const setCookie = res.headers.get('set-cookie') ?? ''
  const m = setCookie.match(/SID=([^;]+)/)
  const sid = m?.[1]
  if (!sid) throw new Error('qBittorrent did not return a session cookie')
  sessions.set(sessionKey(config), { sid })
  return sid
}

async function ensureSid(config: Record<string, unknown>, signal: AbortSignal): Promise<string> {
  const existing = sessions.get(sessionKey(config))
  if (existing) return existing.sid
  return login(config, signal)
}

/**
 * Call an API v2 endpoint with the SID cookie, transparently re-logging in once
 * on a 403 (expired/invalid SID).
 */
async function call<T = unknown>(
  config: Record<string, unknown>,
  path: string,
  params: Record<string, string> | null,
  signal: AbortSignal,
  retried = false
): Promise<T> {
  const base = baseUrl(config)
  const sid = await ensureSid(config, signal)
  const isPost = params != null
  const res = await fetch(`${base}${path}`, {
    method: isPost ? 'POST' : 'GET',
    headers: {
      Cookie: `SID=${sid}`,
      Referer: base,
      ...(isPost ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    body: isPost ? new URLSearchParams(params).toString() : undefined,
    signal
  })
  if (res.status === 403 && !retried) {
    sessions.delete(sessionKey(config))
    return call<T>(config, path, params, signal, true)
  }
  const text = await res.text()
  if (!res.ok) throw new Error(`qBittorrent ${path} → ${res.status}${text ? ` ${text.slice(0, 120)}` : ''}`)
  if (!text) return null as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

interface TransferInfo { dl_info_speed?: number, up_info_speed?: number, dl_info_data?: number, up_info_data?: number, connection_status?: string }
interface Torrent { hash?: string, name?: string, state?: string, progress?: number, dlspeed?: number, upspeed?: number, ratio?: number, category?: string }

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

/** Filter selector reused by list + monitor. */
const FILTER_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Downloading', value: 'downloading' },
  { label: 'Seeding', value: 'seeding' },
  { label: 'Completed', value: 'completed' },
  { label: 'Paused', value: 'paused' },
  { label: 'Active', value: 'active' },
  { label: 'Stalled', value: 'stalled' },
  { label: 'Errored', value: 'errored' }
]

const TARGET_SCHEMA = [
  { key: 'kind', label: 'Show', type: 'select' as const, default: 'stats', options: [
    { label: 'Stats (speeds, torrent counts)', value: 'stats' },
    { label: 'Status (up / down)', value: 'status' }
  ] }
]

export const qbittorrentIntegration: Integration = {
  id: 'qbittorrent',
  name: 'qBittorrent',
  icon: 'i-simple-icons-qbittorrent',
  connectionSchema: [
    {
      key: 'baseUrl',
      label: 'WebUI URL',
      type: 'string',
      required: true,
      placeholder: 'http://qbittorrent.local:8080',
      help: 'The qBittorrent Web UI URL (with port). Enable the Web UI under Tools → Options → Web UI.'
    },
    { key: 'username', label: 'Username', type: 'string', required: true, default: 'admin' },
    { key: 'password', label: 'Password', type: 'secret', required: true }
  ],
  testConnection: async (config, signal) => {
    if (!String(config.baseUrl ?? '').trim()) return { ok: false, message: 'WebUI URL is required' }
    try {
      // Force a fresh login, then read the app version.
      sessions.delete(sessionKey(config))
      const version = await call<string>(config, '/api/v2/app/version', null, signal)
      return { ok: true, message: version ? `Connected — qBittorrent ${version}` : 'Connected' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not connect' }
    }
  },
  triggers: [
    {
      id: 'torrentsInState',
      name: 'When torrents match a state',
      description:
        'Polls the torrent list filtered by state and fires while the count is at or above a threshold. Fires on every check while the test passes — gate with state to act once. Exposes {{ trigger.count }} and {{ trigger.torrents }}.',
      kind: 'poll',
      needsConnection: true,
      configSchema: [
        { key: 'filter', label: 'State filter', type: 'select', default: 'errored', options: FILTER_OPTIONS },
        { key: 'minCount', label: 'Minimum count to fire', type: 'number', default: 1 }
      ],
      poll: async (ctx) => {
        const cfg = ctx.connection!.config
        const filter = String(ctx.config.filter ?? 'all')
        let torrents: Torrent[]
        try {
          torrents = await call<Torrent[]>(cfg, `/api/v2/torrents/info?filter=${encodeURIComponent(filter)}`, null, ctx.signal) ?? []
        } catch {
          return null
        }
        const min = Number(ctx.config.minCount ?? 1)
        if (torrents.length < min) return null
        return { count: torrents.length, torrents }
      }
    }
  ],
  actions: [
    {
      id: 'listTorrents',
      name: 'List torrents',
      description: 'Returns torrents, optionally filtered by state and/or category.',
      needsConnection: true,
      outputKeys: ['torrents', 'count'],
      inputSchema: [
        { key: 'filter', label: 'State filter', type: 'select', default: 'all', options: FILTER_OPTIONS },
        { key: 'category', label: 'Category', type: 'string', placeholder: 'movies', advanced: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const qs = new URLSearchParams({ filter: String(ctx.input.filter ?? 'all') })
        if (String(ctx.input.category ?? '').trim()) qs.set('category', String(ctx.input.category))
        const torrents = await call<Torrent[]>(cfg, `/api/v2/torrents/info?${qs.toString()}`, null, ctx.signal) ?? []
        ctx.log(`qbittorrent → ${torrents.length} torrents`)
        return { torrents, count: torrents.length }
      }
    },
    {
      id: 'transferInfo',
      name: 'Get transfer info',
      description: 'Returns global download/upload speeds and totals.',
      needsConnection: true,
      outputKeys: ['dlSpeed', 'upSpeed', 'dlData', 'upData', 'connectionStatus'],
      inputSchema: [],
      run: async (ctx) => {
        const info = await call<TransferInfo>(ctx.connection!.config, '/api/v2/transfer/info', null, ctx.signal) ?? {}
        return {
          dlSpeed: info.dl_info_speed ?? 0,
          upSpeed: info.up_info_speed ?? 0,
          dlData: info.dl_info_data ?? 0,
          upData: info.up_info_data ?? 0,
          connectionStatus: info.connection_status ?? 'unknown'
        }
      }
    },
    {
      id: 'addTorrent',
      name: 'Add torrent (URL / magnet)',
      description: 'Adds one or more torrents by URL or magnet link.',
      needsConnection: true,
      outputKeys: ['added'],
      inputSchema: [
        { key: 'urls', label: 'URLs / magnets', type: 'string', required: true, help: 'One per line, or comma-separated. Magnet links or http(s) .torrent URLs.' },
        { key: 'category', label: 'Category', type: 'string', placeholder: 'movies', advanced: true },
        { key: 'savepath', label: 'Save path', type: 'string', advanced: true },
        { key: 'paused', label: 'Add paused', type: 'boolean', default: false, advanced: true }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const raw = String(ctx.input.urls ?? '')
        const urls = raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
        if (urls.length === 0) throw new Error('At least one URL or magnet is required')
        const params: Record<string, string> = { urls: urls.join('\n') }
        if (String(ctx.input.category ?? '').trim()) params.category = String(ctx.input.category)
        if (String(ctx.input.savepath ?? '').trim()) params.savepath = String(ctx.input.savepath)
        if (ctx.input.paused) params.paused = 'true'
        await call(cfg, '/api/v2/torrents/add', params, ctx.signal)
        ctx.log(`qbittorrent → added ${urls.length} torrent(s)`)
        return { added: urls.length }
      }
    },
    {
      id: 'controlTorrents',
      name: 'Pause / resume / delete torrents',
      description: 'Performs an action on torrents identified by hash (or "all").',
      needsConnection: true,
      outputKeys: ['action', 'hashes'],
      inputSchema: [
        { key: 'action', label: 'Action', type: 'select', required: true, options: [
          { label: 'Pause', value: 'pause' },
          { label: 'Resume', value: 'resume' },
          { label: 'Recheck', value: 'recheck' },
          { label: 'Delete (keep files)', value: 'delete' },
          { label: 'Delete (with files)', value: 'deleteWithFiles' }
        ] },
        { key: 'hashes', label: 'Torrent hashes', type: 'string', required: true, placeholder: 'all', help: 'Pipe- or comma-separated hashes, or "all".' }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const action = String(ctx.input.action ?? '')
        const hashes = String(ctx.input.hashes ?? '').split(/[|,]/).map(s => s.trim()).filter(Boolean).join('|') || 'all'
        const map: Record<string, { path: string, extra?: Record<string, string> }> = {
          pause: { path: '/api/v2/torrents/pause' },
          resume: { path: '/api/v2/torrents/resume' },
          recheck: { path: '/api/v2/torrents/recheck' },
          delete: { path: '/api/v2/torrents/delete', extra: { deleteFiles: 'false' } },
          deleteWithFiles: { path: '/api/v2/torrents/delete', extra: { deleteFiles: 'true' } }
        }
        const op = map[action]
        if (!op) throw new Error(`Unknown action: ${action}`)
        await call(cfg, op.path, { hashes, ...(op.extra ?? {}) }, ctx.signal)
        ctx.log(`qbittorrent → ${action} ${hashes}`)
        return { action, hashes }
      }
    },
    {
      id: 'setSpeedLimits',
      name: 'Set global speed limits',
      description: 'Sets the global download/upload rate limits (KiB/s, 0 = unlimited).',
      needsConnection: true,
      outputKeys: ['dlLimit', 'upLimit'],
      inputSchema: [
        { key: 'dlLimit', label: 'Download limit (KiB/s)', type: 'number', default: 0 },
        { key: 'upLimit', label: 'Upload limit (KiB/s)', type: 'number', default: 0 }
      ],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const dl = Math.max(0, Number(ctx.input.dlLimit ?? 0)) * 1024
        const up = Math.max(0, Number(ctx.input.upLimit ?? 0)) * 1024
        await call(cfg, '/api/v2/transfer/setDownloadLimit', { limit: String(dl) }, ctx.signal)
        await call(cfg, '/api/v2/transfer/setUploadLimit', { limit: String(up) }, ctx.signal)
        return { dlLimit: dl, upLimit: up }
      }
    },
    {
      id: 'monitorSnapshot',
      name: 'Monitor snapshot',
      description: 'Returns a normalized snapshot for the Monitoring page (speeds + torrent counts, or up/down).',
      needsConnection: true,
      outputKeys: ['kind', 'state', 'label', 'stats', 'detail', 'raw'],
      inputSchema: TARGET_SCHEMA,
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const wantStatus = String(ctx.input.kind ?? 'stats') === 'status'
        if (wantStatus) {
          try {
            await call(cfg, '/api/v2/app/version', null, ctx.signal)
            const snap: MonitorSnapshot = { kind: 'status', state: 'up', label: 'Up' }
            return snap as unknown as Record<string, unknown>
          } catch (e) {
            const snap: MonitorSnapshot = { kind: 'status', state: 'down', label: 'Down', detail: e instanceof Error ? e.message : undefined }
            return snap as unknown as Record<string, unknown>
          }
        }
        const [info, all] = await Promise.all([
          call<TransferInfo>(cfg, '/api/v2/transfer/info', null, ctx.signal).catch(() => ({} as TransferInfo)),
          call<Torrent[]>(cfg, '/api/v2/torrents/info?filter=all', null, ctx.signal).catch(() => [] as Torrent[])
        ])
        const torrents = all ?? []
        const downloading = torrents.filter(t => /download/i.test(String(t.state ?? ''))).length
        const seeding = torrents.filter(t => /(^up|seed|stalledUP)/i.test(String(t.state ?? ''))).length
        const stats: MonitorSnapshot = {
          kind: 'stats',
          stats: [
            { key: 'down', label: 'Download', icon: 'i-lucide-arrow-down', value: `${fmtBytes(info.dl_info_speed)}/s` },
            { key: 'up', label: 'Upload', icon: 'i-lucide-arrow-up', value: `${fmtBytes(info.up_info_speed)}/s` },
            { key: 'active', label: 'Downloading', icon: 'i-lucide-download', value: downloading },
            { key: 'seeding', label: 'Seeding', icon: 'i-lucide-upload', value: seeding },
            { key: 'total', label: 'Total', icon: 'i-lucide-list', value: torrents.length }
          ],
          detail: info.connection_status ? `Connection: ${info.connection_status}` : undefined,
          raw: { transfer: info, count: torrents.length }
        }
        return stats as unknown as Record<string, unknown>
      }
    }
  ],
  monitoring: {
    kind: 'stats',
    snapshotAction: 'monitorSnapshot',
    targetSchema: TARGET_SCHEMA
  }
}
