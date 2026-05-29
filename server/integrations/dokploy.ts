import type { ActionContext, ActionDef, Integration, MonitorSnapshot } from '../engine/types'
import { loadDokploySpec, type SpecOperation } from './dokploy-spec'

/**
 * Dokploy. The connection is one Dokploy instance (baseUrl + API token).
 *
 * Machine metrics come from the Dokploy monitoring AGENT directly
 * (`GET http://<server-ip>:4500/metrics`, auth: `Authorization: Bearer <token>`),
 * not via Dokploy's `server.getServerMetrics` proxy. The agent returns a flat
 * array of samples (newest last); we take the latest and surface flat fields:
 *   diskFree, diskTotal, diskUsage, diskUsedPercentage   (GB / %)
 *   cpu, memUsedPercentage                               (%)
 * The agent reports diskUsed/totalDisk (GB) + cpu/memUsed (%) as strings; free
 * and used% are derived. Requires the agent container to be deployed in Dokploy
 * (Web Server → Monitoring) — the url+token come from that setup.
 */

/**
 * One sample from the Dokploy monitoring agent (`GET :4500/metrics`). Numeric
 * fields are encoded as strings; `diskUsed`/`totalDisk`/`memUsed` are what we
 * derive the flat disk + cpu/mem outputs from. Other fields kept for `raw`.
 */
interface AgentSample {
  cpu?: string
  memUsed?: string
  memUsedGB?: string
  memTotal?: string
  diskUsed?: string
  totalDisk?: string
  networkIn?: string
  networkOut?: string
  timestamp?: string
}

function authHeaders(token: string): Record<string, string> {
  // Dokploy accepts the API token via the Authorization header (x-api-key on
  // some versions); send both to be safe.
  return { 'Authorization': token, 'x-api-key': token, 'Accept': 'application/json' }
}

function base(ctx: { connection: { config: Record<string, unknown> } | null }): string {
  const url = String(ctx.connection?.config.baseUrl ?? '').replace(/\/$/, '')
  if (!url) throw new Error('Dokploy connection has no base URL')
  return url
}

async function post(
  baseUrl: string,
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<unknown> {
  const res = await fetch(`${baseUrl}/api/${endpoint}`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Dokploy ${endpoint}: ${res.status} ${text}`.trim())
  }
  return res.json().catch(() => ({}))
}

/** Generic GET/POST against any Dokploy procedure, used by auto-generated actions. */
async function callProcedure(
  ctx: ActionContext,
  op: SpecOperation
): Promise<Record<string, unknown>> {
  const token = String(ctx.connection!.config.apiToken ?? '')
  const url = `${base(ctx)}/api/${op.procedure}`

  // Build args from the declared input schema; coerce JSON-text fields back to
  // objects/arrays, drop empty optionals.
  const args: Record<string, unknown> = {}
  for (const f of op.inputSchema) {
    const v = ctx.input[f.key]
    if (v === undefined || v === '') continue
    if (op.jsonKeys.includes(f.key) && typeof v === 'string') {
      try {
        args[f.key] = JSON.parse(v)
      } catch {
        throw new Error(`Field "${f.key}" must be valid JSON`)
      }
    } else {
      args[f.key] = v
    }
  }

  let res: Response
  if (op.method === 'get') {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(args)) q.set(k, String(v))
    const qs = q.toString()
    res = await fetch(qs ? `${url}?${qs}` : url, { headers: authHeaders(token), signal: ctx.signal })
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: ctx.signal
    })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let detail = body
    try {
      const j = JSON.parse(body) as { message?: string }
      if (j?.message) detail = j.message
    } catch { /* not JSON */ }
    throw new Error(`Dokploy ${op.procedure} ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  const result = await res.json().catch(() => ({}))
  ctx.log(`${op.method.toUpperCase()} ${op.procedure} → ${res.status}`)
  return { result }
}

/**
 * Auto-generate one action per Dokploy endpoint from the OpenAPI spec, EXCEPT
 * the procedures already covered by hand-crafted actions (which have richer
 * output parsing). The registry abstraction means these need no UI changes.
 */
function generatedActions(handCraftedProcedures: Set<string>): ActionDef[] {
  return loadDokploySpec()
    .filter(op => !handCraftedProcedures.has(op.procedure))
    .map((op): ActionDef => ({
      // namespaced id avoids any collision with hand-crafted ids
      id: `api:${op.procedure}`,
      name: op.name,
      description: op.description,
      needsConnection: true,
      inputSchema: op.inputSchema,
      outputKeys: ['result'],
      run: ctx => callProcedure(ctx, op)
    }))
}

// procedures the hand-crafted actions below already cover (kept for nicer
// disk-metric parsing / clearer forms); excluded from generation.
const HAND_CRAFTED_PROCEDURES = new Set([
  'server.getServerMetrics',
  'settings.getDockerDiskUsage',
  'application.saveEnvironment',
  'application.redeploy'
])

const getServerMetrics: ActionDef = {
  id: 'getServerMetrics',
  name: 'Get machine metrics (disk/CPU/memory)',
  description:
        'Fetches the latest server metrics from Dokploy monitoring. Reports free disk space, CPU and memory.',
  needsConnection: true,
  inputSchema: [
    { key: 'metricsUrl', label: 'Monitoring URL', type: 'string', required: true, help: 'From the machine\'s monitoring setup.' },
    { key: 'metricsToken', label: 'Monitoring token', type: 'secret', required: true },
    { key: 'dataPoints', label: 'Data points', type: 'string', default: '50' }
  ],
  outputKeys: ['diskFree', 'diskTotal', 'diskUsage', 'diskUsedPercentage', 'cpu', 'memUsedPercentage', 'raw'],
  run: async (ctx) => {
    const metricsUrl = String(ctx.input.metricsUrl ?? '').trim()
    const metricsToken = String(ctx.input.metricsToken ?? '').trim()
    const dataPoints = String(ctx.input.dataPoints ?? '50')
    if (!metricsToken) {
      throw new Error('No monitoring token — enable monitoring for this server in Dokploy (Web Server → Monitoring) and deploy the agent, then re-fetch the token.')
    }
    if (!metricsUrl) {
      throw new Error('No monitoring URL — the agent is served at http://<server-ip>:4500/metrics.')
    }

    // Talk to the monitoring agent DIRECTLY (not via Dokploy's proxy). The
    // agent authenticates with the metrics token as a Bearer credential and
    // returns a flat array of samples, newest last:
    //   [{ cpu, memUsed, memUsedGB, memTotal, diskUsed, totalDisk, networkIn, ... }]
    // (cpu/mem/disk are percentages-or-GB encoded as strings).
    const url = new URL(metricsUrl)
    // `?limit=N` caps how many samples the agent returns; we only need the latest.
    if (!url.searchParams.has('limit')) url.searchParams.set('limit', dataPoints)
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${metricsToken}`, Accept: 'application/json' },
      signal: ctx.signal
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const hint = res.status === 401
        ? ' — token mismatch, or the monitoring agent container is not running'
        : ''
      throw new Error(`Monitoring agent ${res.status}${hint}${body ? `: ${body.slice(0, 200)}` : ''}`)
    }
    const raw = (await res.json()) as AgentSample[]
    const latest = Array.isArray(raw) && raw.length ? raw[raw.length - 1] : undefined

    // Agent gives used + total (GB) as strings; derive free + used%.
    const num = (v: string | number | undefined): number | null => {
      const n = typeof v === 'string' ? parseFloat(v) : v
      return typeof n === 'number' && Number.isFinite(n) ? n : null
    }
    // IMPORTANT: the agent's `diskUsed` is the USED PERCENT of `/` (gopsutil
    // disk.Usage("/").UsedPercent — same source as `df`), NOT gigabytes.
    // `totalDisk` is the partition size in GB. So used% is `diskUsed` directly,
    // and the GB figures are derived from it. (Confirmed against the agent's Go
    // source: apps/monitoring/monitoring/monitor.go.)
    const diskTotal = num(latest?.totalDisk)
    const diskUsedPercentage = num(latest?.diskUsed)
    const round2 = (n: number) => Math.round(n * 100) / 100
    const diskUsage = diskTotal != null && diskUsedPercentage != null
      ? round2(diskTotal * diskUsedPercentage / 100)
      : null
    const diskFree = diskTotal != null && diskUsage != null ? round2(diskTotal - diskUsage) : null
    ctx.log(`disk: ${diskFree != null ? `${diskFree}GB free of ${diskTotal}GB (${diskUsedPercentage}% used)` : 'no data'}`)
    return {
      diskFree,
      diskTotal,
      diskUsage,
      diskUsedPercentage,
      cpu: num(latest?.cpu),
      memUsedPercentage: num(latest?.memUsed),
      raw
    }
  }
}

const handCraftedActions: ActionDef[] = [
  getServerMetrics,
  {
    // Powers the Monitoring page. Wraps getServerMetrics and returns a
    // normalized MonitorSnapshot (kind: "gauges"). Its input schema IS the
    // monitor's targetConfig — the metrics URL/token are stored per monitor
    // (auto-filled from Dokploy at create time, just like the old machines flow).
    id: 'monitorSnapshot',
    name: 'Monitor a server (disk/CPU/memory snapshot)',
    description: 'Returns a normalized health snapshot for one server, used by the Monitoring page.',
    needsConnection: true,
    inputSchema: [
      { key: 'metricsUrl', label: 'Monitoring URL', type: 'string', required: true, help: 'The agent metrics endpoint (auto-filled from Dokploy).' },
      { key: 'metricsToken', label: 'Monitoring token', type: 'secret', required: true },
      { key: 'serverId', label: 'Server', type: 'string', help: 'Dokploy serverId, or blank for the host itself.' },
      { key: 'dataPoints', label: 'Data points', type: 'string', default: '50' }
    ],
    outputKeys: ['kind', 'gauges', 'detail', 'raw'],
    run: async (ctx) => {
      // delegate the fetch/parse to getServerMetrics, then normalize
      const metrics = await getServerMetrics.run(ctx) as {
        diskFree?: number | null
        diskUsedPercentage?: number | null
        cpu?: number | null
        memUsedPercentage?: number | null
        raw?: unknown
      }
      const snapshot: MonitorSnapshot = {
        kind: 'gauges',
        gauges: [
          { key: 'cpu', label: 'CPU', icon: 'i-lucide-cpu', value: metrics.cpu ?? null },
          { key: 'mem', label: 'Memory', icon: 'i-lucide-memory-stick', value: metrics.memUsedPercentage ?? null },
          { key: 'disk', label: 'Disk', icon: 'i-lucide-hard-drive', value: metrics.diskUsedPercentage ?? null }
        ],
        detail: metrics.diskFree != null ? `${metrics.diskFree} GB free` : undefined,
        raw: metrics.raw
      }
      return snapshot as unknown as Record<string, unknown>
    }
  },
  {
    id: 'getDockerDiskUsage',
    name: 'Get Docker disk usage',
    description: 'Returns Docker\'s disk usage on the Dokploy host (like `docker system df`).',
    needsConnection: true,
    inputSchema: [],
    outputKeys: ['raw'],
    run: async (ctx) => {
      const token = String(ctx.connection!.config.apiToken ?? '')
      const res = await fetch(`${base(ctx)}/api/settings.getDockerDiskUsage`, {
        headers: authHeaders(token),
        signal: ctx.signal
      })
      if (!res.ok) throw new Error(`Dokploy getDockerDiskUsage: ${res.status}`)
      const raw = await res.json()
      return { raw }
    }
  },
  {
    id: 'saveEnvironment',
    name: 'Set an application\'s environment variables',
    description:
        'Overwrites an application\'s full environment with the provided value, then (optionally) you redeploy. NOTE: this replaces the ENTIRE env — pass the complete target env, not just the changed lines.',
    needsConnection: true,
    inputSchema: [
      { key: 'applicationId', label: 'Application ID', type: 'string', required: true },
      { key: 'env', label: 'Environment (full .env contents)', type: 'string', required: true, help: 'The complete env file contents. This replaces everything.' },
      { key: 'buildArgs', label: 'Build args', type: 'string' },
      { key: 'buildSecrets', label: 'Build secrets', type: 'string' },
      { key: 'createEnvFile', label: 'Create .env file', type: 'boolean', default: true }
    ],
    outputKeys: ['saved', 'applicationId'],
    run: async (ctx) => {
      const token = String(ctx.connection!.config.apiToken ?? '')
      const applicationId = String(ctx.input.applicationId ?? '')
      await post(base(ctx), token, 'application.saveEnvironment', {
        applicationId,
        env: ctx.input.env ?? null,
        buildArgs: ctx.input.buildArgs ?? null,
        buildSecrets: ctx.input.buildSecrets ?? null,
        createEnvFile: ctx.input.createEnvFile !== false
      }, ctx.signal)
      ctx.log(`saved environment for ${applicationId}`)
      return { saved: true, applicationId }
    }
  },
  {
    id: 'redeploy',
    name: 'Redeploy an application',
    description: 'Triggers a redeploy of an application (e.g. to pick up new environment variables).',
    needsConnection: true,
    inputSchema: [
      { key: 'applicationId', label: 'Application ID', type: 'string', required: true },
      { key: 'title', label: 'Deploy title', type: 'string', placeholder: 'Failover redeploy' }
    ],
    outputKeys: ['redeployed', 'applicationId'],
    run: async (ctx) => {
      const token = String(ctx.connection!.config.apiToken ?? '')
      const applicationId = String(ctx.input.applicationId ?? '')
      await post(base(ctx), token, 'application.redeploy', {
        applicationId,
        ...(ctx.input.title ? { title: String(ctx.input.title) } : {})
      }, ctx.signal)
      ctx.log(`redeployed ${applicationId}`)
      return { redeployed: true, applicationId }
    }
  }
]

export const dokployIntegration: Integration = {
  id: 'dokploy',
  name: 'Dokploy',
  img: 'https://ph-files.imgix.net/09bceab8-ee20-4a9b-a654-9f72808cf96c.png?auto=format',
  connectionSchema: [
    { key: 'baseUrl', label: 'Dokploy URL', type: 'string', required: true, placeholder: 'https://dokploy.example.com' },
    { key: 'apiToken', label: 'API token', type: 'secret', required: true, help: 'From Dokploy → Settings → API/Tokens.' }
  ],
  testConnection: async (config, signal) => {
    const url = String(config.baseUrl ?? '').replace(/\/$/, '')
    const token = String(config.apiToken ?? '')
    if (!url || !token) return { ok: false, message: 'URL and API token are required' }
    try {
      const res = await fetch(`${url}/api/server.all`, { headers: authHeaders(token), signal })
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'API token rejected (401/403)' }
      if (!res.ok) return { ok: false, message: `Dokploy returned ${res.status}` }
      const list = await res.json().catch(() => null)
      const n = Array.isArray(list) ? list.length : 0
      return { ok: true, message: `Connected — ${n} server${n === 1 ? '' : 's'} found` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not reach Dokploy' }
    }
  },
  triggers: [],
  // Hand-crafted actions (nicer output parsing) first, then one auto-generated
  // action per remaining Dokploy endpoint from the OpenAPI spec.
  actions: [...handCraftedActions, ...generatedActions(HAND_CRAFTED_PROCEDURES)],
  monitoring: {
    kind: 'gauges',
    snapshotAction: 'monitorSnapshot',
    // The metrics URL/token are auto-discovered from Dokploy (see the
    // monitorable-targets endpoint) and stored per monitor; serverId records
    // which server they belong to (blank = the Dokploy host).
    targetSchema: [
      { key: 'metricsUrl', label: 'Monitoring URL', type: 'string', required: true },
      { key: 'metricsToken', label: 'Monitoring token', type: 'secret', required: true },
      { key: 'serverId', label: 'Server', type: 'string' },
      { key: 'dataPoints', label: 'Data points', type: 'string', default: '50' }
    ]
  }
}
