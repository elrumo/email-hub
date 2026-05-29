import type { ResolvedConnection } from '../engine/types'

/**
 * Dokploy monitoring auto-discovery. Given a Dokploy connection (baseUrl +
 * apiToken), Dokploy itself hands back the monitoring token + URL — no manual
 * setup needed beyond having the monitoring agent deployed.
 *
 * Two procedures are read:
 *  - user.getMetricsToken → the Dokploy HOST's config (token, port, ip)
 *  - server.all           → each remote server's own metricsConfig.server.*
 *
 * Shared by the discovery endpoint (pre-fills the Add-monitor form) and the
 * `monitors/from-dokploy` endpoint (creates monitors straight from the API).
 */

function authHeaders(token: string): Record<string, string> {
  // Dokploy accepts the API token via Authorization (x-api-key on some versions).
  return { 'Authorization': token, 'x-api-key': token, 'Accept': 'application/json' }
}

interface MetricsServerCfg { token?: string, port?: number, urlCallback?: string }

export interface DiscoveredTarget {
  /** Dokploy serverId; '' (empty) means the Dokploy host itself */
  serverId: string
  name: string
  ipAddress: string | null
  metricsToken: string | null
  metricsUrl: string | null
}

export interface DokployMonitoringInfo {
  /** true when a metrics token exists (the agent is set up & reachable) */
  monitoringEnabled: boolean
  /** the Dokploy host's metrics token */
  metricsToken: string | null
  /** the Dokploy host's metrics URL */
  defaultMetricsUrl: string
  /** the host + every remote server, each with its own token/url */
  targets: DiscoveredTarget[]
}

/**
 * Discover the monitoring token + URL for a Dokploy connection's host and all
 * its remote servers. Never throws on a missing endpoint — fields come back
 * null/empty so callers can decide what's usable.
 */
export async function discoverDokployMonitoring(
  connection: ResolvedConnection,
  signal: AbortSignal
): Promise<DokployMonitoringInfo> {
  const baseUrl = String(connection.config.baseUrl ?? '').replace(/\/$/, '')
  const token = String(connection.config.apiToken ?? '')
  if (!baseUrl || !token) throw new Error('connection is missing baseUrl/apiToken')

  async function get(endpoint: string): Promise<unknown> {
    const res = await fetch(`${baseUrl}/api/${endpoint}`, { headers: authHeaders(token), signal })
    if (!res.ok) throw new Error(`${endpoint}: ${res.status}`)
    return res.json().catch(() => null)
  }

  // The agent serves samples at http://<server-ip>:<port>/metrics (default port
  // 4500), authenticated with the metrics token as a Bearer credential. NOTE:
  // do NOT use cfg.urlCallback — that's the cron *push* callback into Dokploy's
  // tRPC proxy (server.getServerMetrics), which rejects the agent token (401).
  // Only fall back to it when there's no ip to build the direct URL from.
  function metricsUrlFrom(host: string | null, cfg: MetricsServerCfg | undefined): string {
    if (host) return `http://${host}:${cfg?.port ?? 4500}/metrics`
    if (cfg?.urlCallback) return cfg.urlCallback
    return `${baseUrl}/metrics`
  }

  // ── host config ──────────────────────────────────────────────────────────
  let hostToken: string | null = null
  let hostIp: string | null = null
  let hostCfg: MetricsServerCfg | undefined
  try {
    const t = await get('user.getMetricsToken') as {
      serverIp?: string
      metricsConfig?: { server?: MetricsServerCfg }
    } | string | null
    if (typeof t === 'string') {
      hostToken = t || null
    } else if (t) {
      hostIp = t.serverIp ?? null
      hostCfg = t.metricsConfig?.server
      hostToken = hostCfg?.token || null
    }
  } catch {
    // older Dokploy without this endpoint — leave host fields null
  }
  const defaultMetricsUrl = metricsUrlFrom(hostIp, hostCfg)

  // ── targets: host + remote servers ────────────────────────────────────────
  const targets: DiscoveredTarget[] = [{
    serverId: '',
    name: 'Dokploy host',
    ipAddress: hostIp,
    metricsToken: hostToken,
    metricsUrl: hostToken ? defaultMetricsUrl : null
  }]

  try {
    const list = await get('server.all')
    if (Array.isArray(list)) {
      for (const s of list as Array<Record<string, unknown>>) {
        const sid = String(s.serverId ?? s.id ?? '')
        if (!sid) continue
        const cfg = (s.metricsConfig as { server?: MetricsServerCfg } | undefined)?.server
        const ip = (s.ipAddress as string) ?? null
        targets.push({
          serverId: sid,
          name: String(s.name ?? sid),
          ipAddress: ip,
          metricsToken: cfg?.token || null,
          metricsUrl: cfg?.token ? metricsUrlFrom(ip, cfg) : null
        })
      }
    }
  } catch {
    // server.all unavailable on some setups — host-only is fine
  }

  return {
    // a token is the real signal the agent is usable — `enabledFeatures` stays
    // false on self-hosted Dokploy even when monitoring works.
    monitoringEnabled: !!hostToken,
    metricsToken: hostToken,
    defaultMetricsUrl,
    targets
  }
}

/**
 * Enable monitoring for a Dokploy target by configuring & deploying the agent
 * via the API — `admin.setupMonitoring` for the host (serverId === ''), or
 * `server.setupMonitoring` for a remote server. Both procedures require a FULL
 * `metricsConfig` (no server-side defaults), so we synthesise sensible defaults
 * matching Dokploy's own setup screen and let the caller re-discover afterwards
 * to pick up the freshly-minted token + URL.
 *
 * The default refresh/retention/threshold values mirror Dokploy's UI defaults;
 * the token is a fresh random secret the agent will authenticate `/metrics`
 * with. `urlCallback` is the cron *push* endpoint into Dokploy's tRPC proxy.
 */
export async function enableDokployMonitoring(
  connection: ResolvedConnection,
  serverId: string,
  signal: AbortSignal
): Promise<void> {
  const baseUrl = String(connection.config.baseUrl ?? '').replace(/\/$/, '')
  const token = String(connection.config.apiToken ?? '')
  if (!baseUrl || !token) throw new Error('connection is missing baseUrl/apiToken')

  // a fresh agent token (the secret the agent guards its /metrics endpoint with)
  const metricsToken = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`).replace(/-/g, '')
  const port = 4500
  const metricsConfig = {
    server: {
      refreshRate: 60,
      port,
      token: metricsToken,
      // Dokploy's cron push target — server.getServerMetrics on the host.
      urlCallback: `${baseUrl}/api/server.getServerMetrics`,
      retentionDays: 30,
      cronJob: '*/1 * * * *',
      thresholds: { cpu: 0, memory: 0 }
    },
    containers: {
      refreshRate: 60,
      services: { include: [] as string[], exclude: [] as string[] }
    }
  }

  const isHost = !serverId
  const endpoint = isHost ? 'admin.setupMonitoring' : 'server.setupMonitoring'
  const body: Record<string, unknown> = isHost
    ? { metricsConfig }
    : { serverId, metricsConfig }

  const res = await fetch(`${baseUrl}/api/${endpoint}`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Dokploy ${endpoint}: ${res.status}${text ? ` ${text.slice(0, 200)}` : ''}`.trim())
  }
}
