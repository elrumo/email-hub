import type { Integration, MonitorSnapshot } from '../engine/types'

/**
 * Uptime Kuma. Reads the Prometheus /metrics endpoint (Basic auth with the
 * API key as the password). Ported from the legacy server/utils/kuma.ts.
 *
 * Status codes: 1 = up, 0 = down, 2 = pending, 3 = maintenance.
 */
function metricsUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '') + '/metrics'
}
function basicAuth(apiKey: string): string {
  return 'Basic ' + Buffer.from(':' + apiKey).toString('base64')
}

async function fetchStatuses(
  baseUrl: string,
  apiKey: string,
  signal: AbortSignal
): Promise<Map<string, number>> {
  const res = await fetch(metricsUrl(baseUrl), { headers: { Authorization: basicAuth(apiKey) }, signal })
  if (!res.ok) throw new Error(`Kuma /metrics ${res.status}`)
  const text = await res.text()
  const statuses = new Map<string, number>()
  for (const line of text.split('\n')) {
    if (!line.startsWith('monitor_status{')) continue
    const nameMatch = line.match(/monitor_name="([^"]+)"/)
    const valMatch = line.match(/}\s+([0-9.eE+-]+)\s*$/)
    if (nameMatch && valMatch) {
      const v = Number(valMatch[1])
      if (v === 0 || v === 1 || v === 2 || v === 3) statuses.set(nameMatch[1]!, v)
    }
  }
  return statuses
}

export interface DiscoveredKumaMonitor {
  name: string
  /** monitor group from the `monitor_group` label, or null when ungrouped/unsupported */
  group: string | null
  status: number
}

/**
 * Auto-discovery for the Add-monitor form (Kuma path). Reads /metrics and
 * returns every monitor Kuma reports, with its group (when the exporter emits a
 * `monitor_group` label — newer Kuma versions do) so the UI can group + sort.
 */
export async function discoverKumaMonitors(
  baseUrl: string,
  apiKey: string,
  signal: AbortSignal
): Promise<DiscoveredKumaMonitor[]> {
  const res = await fetch(metricsUrl(baseUrl), { headers: { Authorization: basicAuth(apiKey) }, signal })
  if (!res.ok) throw new Error(`Kuma /metrics ${res.status}`)
  const text = await res.text()
  const byName = new Map<string, DiscoveredKumaMonitor>()
  for (const line of text.split('\n')) {
    if (!line.startsWith('monitor_status{')) continue
    const name = line.match(/monitor_name="([^"]+)"/)?.[1]
    if (!name) continue
    const valMatch = line.match(/}\s+([0-9.eE+-]+)\s*$/)
    const v = valMatch ? Number(valMatch[1]) : NaN
    const group = line.match(/monitor_group="([^"]*)"/)?.[1] || null
    byName.set(name, { name, group, status: Number.isFinite(v) ? v : -1 })
  }
  return [...byName.values()]
}

export const kumaIntegration: Integration = {
  id: 'kuma',
  name: 'Uptime Kuma',
  img: 'https://uptime.kuma.pet/img/icon.svg',
  connectionSchema: [
    { key: 'baseUrl', label: 'Kuma URL', type: 'string', required: true, placeholder: 'https://status.example.com' },
    { key: 'apiKey', label: 'API key', type: 'secret', required: true, help: 'A Kuma API key with metrics access.' }
  ],
  testConnection: async (config, signal) => {
    const baseUrl = String(config.baseUrl ?? '')
    const apiKey = String(config.apiKey ?? '')
    if (!baseUrl || !apiKey) return { ok: false, message: 'URL and API key are required' }
    try {
      const statuses = await fetchStatuses(baseUrl, apiKey, signal)
      return { ok: true, message: `Connected — ${statuses.size} monitor${statuses.size === 1 ? '' : 's'} found` }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reach Kuma'
      return { ok: false, message: /401|403/.test(msg) ? 'API key rejected' : msg }
    }
  },
  triggers: [
    {
      id: 'monitorDown',
      name: 'When a monitor is down',
      description: 'Fires on each check while the chosen monitor reports DOWN.',
      kind: 'poll',
      needsConnection: true,
      configSchema: [
        { key: 'monitor', label: 'Monitor name', type: 'string', required: true, help: 'Exact monitor name as it appears in Kuma.' }
      ],
      poll: async (ctx) => {
        const cfg = ctx.connection!.config
        const statuses = await fetchStatuses(
          String(cfg.baseUrl),
          String(cfg.apiKey),
          ctx.signal
        )
        const monitor = String(ctx.config.monitor ?? '')
        const status = statuses.get(monitor)
        if (status === undefined) return null // monitor not found → don't fire
        if (status === 1) return null // up → don't fire
        return { monitor, status, isDown: true }
      }
    }
  ],
  actions: [
    {
      id: 'getMonitorStatus',
      name: 'Get a monitor\'s status',
      description: 'Returns the current status of a Kuma monitor (up/down/pending/maintenance).',
      needsConnection: true,
      inputSchema: [{ key: 'monitor', label: 'Monitor name', type: 'string', required: true }],
      outputKeys: ['status', 'statusText', 'isUp', 'isDown'],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const statuses = await fetchStatuses(String(cfg.baseUrl), String(cfg.apiKey), ctx.signal)
        const monitor = String(ctx.input.monitor ?? '')
        const status = statuses.get(monitor)
        const text
          = status === 1 ? 'up' : status === 0 ? 'down' : status === 2 ? 'pending' : status === 3 ? 'maintenance' : 'unknown'
        ctx.log(`${monitor} → ${text}`)
        return { status: status ?? null, statusText: text, isUp: status === 1, isDown: status === 0 }
      }
    },
    {
      // Powers the Monitoring page. Returns a normalized MonitorSnapshot
      // (kind: "status"). Input schema IS the monitor's targetConfig.
      id: 'monitorSnapshot',
      name: 'Monitor status snapshot',
      description: 'Returns a normalized up/down snapshot for one Kuma monitor, used by the Monitoring page.',
      needsConnection: true,
      inputSchema: [{ key: 'monitor', label: 'Monitor name', type: 'string', required: true }],
      outputKeys: ['kind', 'state', 'label', 'detail', 'raw'],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const statuses = await fetchStatuses(String(cfg.baseUrl), String(cfg.apiKey), ctx.signal)
        const monitor = String(ctx.input.monitor ?? '')
        const status = statuses.get(monitor)
        const state: 'up' | 'down' | 'pending' | 'maintenance' | 'unknown'
          = status === 1 ? 'up' : status === 0 ? 'down' : status === 2 ? 'pending' : status === 3 ? 'maintenance' : 'unknown'
        const label = state.charAt(0).toUpperCase() + state.slice(1)
        ctx.log(`${monitor} → ${state}`)
        const snapshot: MonitorSnapshot = {
          kind: 'status',
          state,
          label,
          detail: status === undefined ? 'Monitor not found in Kuma' : undefined,
          raw: { status }
        }
        return snapshot as unknown as Record<string, unknown>
      }
    }
  ],
  monitoring: {
    kind: 'status',
    snapshotAction: 'monitorSnapshot',
    targetSchema: [
      { key: 'monitor', label: 'Monitor name', type: 'string', required: true, help: 'Exact monitor name as it appears in Kuma.' }
    ]
  }
}
