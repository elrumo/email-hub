import type { ActionContext, FieldSchema, Integration, MonitorSnapshot, TriggerContext } from '../engine/types'
import { assertSafeUrl } from '../connectors/ssrf'
import { readPingSamples } from '../utils/pingMonitor'

/**
 * Ping — a generic HTTP request input. No connection/credentials of its own:
 * the user supplies the URL, method, optional headers/body and optional auth
 * inline on each step. It exposes:
 *
 *  - an action `request` that performs the call and returns the full normalized
 *    response ({ status, ok, body, json, durationMs, … }) so a downstream
 *    `condition` step can evaluate it with the engine's standard operators
 *    (e.g. `{{ steps.ping.status }} eq 200`, `{{ steps.ping.json.health }}
 *    contains "ok"`); and
 *  - a poll trigger `responseMatches` that pings a URL on a schedule and fires
 *    only when the response passes a chosen test (reachable / status code /
 *    body contains), so a flow can react to an endpoint going up or down.
 *
 * Like other built-in HTTP integrations this just `fetch`es inside `run`/`poll`.
 * It is built-in (trusted) code, but because the URL is fully user-supplied at
 * runtime we still route every request through the SSRF guard so a flow can't
 * be pointed at the cloud metadata endpoint or a private admin port.
 */

// ---------------------------------------------------------------------------
// Shared request building / execution
// ---------------------------------------------------------------------------

type AuthType = 'none' | 'bearer' | 'basic' | 'header'

export interface PingRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: string | undefined
  timeoutMs: number
}

/** Coerce a keyValue field (or anything) into a flat string→string map. */
function asStringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (k) out[k] = val == null ? '' : String(val)
  }
  return out
}

/** Build the concrete request from a step's resolved input (or a monitor's targetConfig). */
export function buildRequest(input: Record<string, unknown>): PingRequest {
  const url = String(input.url ?? '').trim()
  if (!url) throw new Error('url is required')

  const method = String(input.method ?? 'GET').trim().toUpperCase() || 'GET'
  const headers = asStringMap(input.headers)

  // --- auth: layered on top of any explicit headers ---
  const authType = String(input.authType ?? 'none') as AuthType
  if (authType === 'bearer') {
    const token = String(input.authToken ?? '').trim()
    if (token) headers.Authorization = `Bearer ${token}`
  } else if (authType === 'basic') {
    const user = String(input.authUser ?? '')
    const pass = String(input.authPass ?? '')
    headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
  } else if (authType === 'header') {
    const name = String(input.authHeaderName ?? '').trim()
    const value = String(input.authToken ?? '')
    if (name) headers[name] = value
  }

  // --- body: only for methods that carry one ---
  let body: string | undefined
  const rawBody = input.body == null ? '' : String(input.body)
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  if (carriesBody && rawBody.trim()) {
    body = rawBody
    // default a content type so JSON bodies aren't sent as text/plain
    const hasContentType = Object.keys(headers).some(h => h.toLowerCase() === 'content-type')
    if (!hasContentType) {
      const looksJson = rawBody.trim().startsWith('{') || rawBody.trim().startsWith('[')
      headers['Content-Type'] = looksJson ? 'application/json' : 'text/plain'
    }
  }

  const timeoutMs = Number(input.timeoutMs ?? 10000) || 10000
  return { url, method, headers, body, timeoutMs }
}

export interface PingResult {
  ok: boolean
  status: number
  statusText: string
  /** raw response body as text (capped) */
  body: string
  /** parsed JSON body, or null if the body wasn't JSON */
  json: unknown
  headers: Record<string, string>
  durationMs: number
  /** the final URL after redirects */
  url: string
  /** true if the request itself failed (DNS, timeout, refused) — distinct from a non-2xx status */
  error: string | null
}

const MAX_BODY = 1_000_000 // 1 MB — don't blow up a flow run record on a huge response

/**
 * Execute the request through the SSRF guard. Network-level failures (timeout,
 * DNS, connection refused, blocked-by-guard) resolve to a PingResult with
 * `error` set and `ok: false` rather than throwing, so a poll trigger / "is it
 * up" check can treat "couldn't connect" as just another (down) outcome. The
 * caller decides whether to surface it as a thrown error.
 */
export async function execute(req: PingRequest, outer: AbortSignal): Promise<PingResult> {
  const fail = (error: string): PingResult => ({
    ok: false, status: 0, statusText: '', body: '', json: null,
    headers: {}, durationMs: 0, url: req.url, error
  })

  const guard = await assertSafeUrl(req.url)
  if (!guard.ok) return fail(guard.reason ?? 'request blocked')

  // combine the flow's abort signal with our per-request timeout
  const timer = AbortSignal.timeout(req.timeoutMs)
  const signal = AbortSignal.any([outer, timer])

  // bun/node has process.hrtime; Date.now is unavailable in workflow scripts but
  // fine in integration runtime. Use performance.now for monotonic timing.
  const started = performance.now()
  let res: Response
  try {
    res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal,
      redirect: 'follow'
    })
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError' || (e as Error)?.name === 'TimeoutError'
    return fail(aborted ? `timed out after ${req.timeoutMs}ms` : (e instanceof Error ? e.message : 'request failed'))
  }

  let text = ''
  try {
    text = await res.text()
    if (text.length > MAX_BODY) text = text.slice(0, MAX_BODY)
  } catch { /* body read failure — leave empty */ }

  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    headers[k] = v
  })

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    body: text,
    json,
    headers,
    durationMs: Math.round(performance.now() - started),
    url: res.url || req.url,
    error: null
  }
}

// shared field group reused by the action's inputSchema and the trigger's configSchema
const REQUEST_FIELDS: FieldSchema[] = [
  { key: 'url', label: 'URL', type: 'string', required: true, placeholder: 'https://example.com/health' },
  {
    key: 'method', label: 'Method', type: 'select', default: 'GET',
    options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m => ({ label: m, value: m }))
  },
  {
    key: 'body', label: 'Body', type: 'string',
    placeholder: '{ "key": "value" }',
    help: 'Sent for non-GET/HEAD methods. JSON bodies get an application/json Content-Type unless you set one.',
    showIf: { field: 'method', in: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }
  },
  { key: 'headers', label: 'Headers', type: 'keyValue', advanced: true, help: 'Extra request headers as key/value pairs.' },
  // --- auth ---
  {
    key: 'authType', label: 'Auth', type: 'select', default: 'none', advanced: true,
    options: [
      { label: 'None', value: 'none' },
      { label: 'Bearer token', value: 'bearer' },
      { label: 'Basic (user / password)', value: 'basic' },
      { label: 'Custom header', value: 'header' }
    ]
  },
  {
    key: 'authToken', label: 'Token / value', type: 'secret', advanced: true,
    help: 'Bearer token, or the value for a custom auth header.',
    showIf: { field: 'authType', in: ['bearer', 'header'] }
  },
  {
    key: 'authHeaderName', label: 'Header name', type: 'string', advanced: true,
    placeholder: 'X-Api-Key', showIf: { field: 'authType', in: ['header'] }
  },
  { key: 'authUser', label: 'Username', type: 'string', advanced: true, showIf: { field: 'authType', in: ['basic'] } },
  { key: 'authPass', label: 'Password', type: 'secret', advanced: true, showIf: { field: 'authType', in: ['basic'] } },
  { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', default: 10000, advanced: true }
]

// ---------------------------------------------------------------------------
// Constant-ping monitor: a server-side loop pings the target on `intervalSeconds`
// for `durationMinutes` (0 = forever) and records each result. The shared
// success rule below decides whether a single ping counts as "up".
// ---------------------------------------------------------------------------

/**
 * Whether one ping result counts as a successful (up) reading for a monitor,
 * per the monitor's `successRule` target field. Used by both the background
 * tick (to stamp `ok`) and the snapshot action (to summarise history).
 */
export function pingSuccess(res: PingResult, successRule: string): boolean {
  if (res.error) return false
  switch (successRule) {
    case 'any': return true // any response at all (even a 500) means "reachable"
    case '2xx': return res.status >= 200 && res.status < 300
    case '2xx3xx':
    default: return res.status >= 200 && res.status < 400
  }
}

/** Fields the user fills per ping monitor — the monitor's targetConfig. */
const MONITOR_TARGET_FIELDS: FieldSchema[] = [
  { key: 'url', label: 'URL', type: 'string', required: true, placeholder: 'https://example.com/health' },
  {
    key: 'method', label: 'Method', type: 'select', default: 'GET',
    options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m => ({ label: m, value: m }))
  },
  {
    key: 'intervalSeconds', label: 'Ping every (seconds)', type: 'number', default: 30,
    help: 'How often to ping. Values below the scheduler tick are batched (multiple pings per tick).'
  },
  {
    key: 'durationMinutes', label: 'Run for (minutes)', type: 'number', default: 0,
    help: 'How long to keep pinging after the monitor is created. 0 = run indefinitely.'
  },
  {
    key: 'successRule', label: 'Count as "up" when…', type: 'select', default: '2xx3xx',
    options: [
      { label: 'status is 2xx or 3xx', value: '2xx3xx' },
      { label: 'status is 2xx only', value: '2xx' },
      { label: 'any response (even errors)', value: 'any' }
    ]
  },
  // body / headers / auth reuse the same advanced fields as the action
  {
    key: 'body', label: 'Body', type: 'string', advanced: true,
    placeholder: '{ "key": "value" }',
    showIf: { field: 'method', in: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }
  },
  { key: 'headers', label: 'Headers', type: 'keyValue', advanced: true, help: 'Extra request headers.' },
  {
    key: 'authType', label: 'Auth', type: 'select', default: 'none', advanced: true,
    options: [
      { label: 'None', value: 'none' },
      { label: 'Bearer token', value: 'bearer' },
      { label: 'Basic (user / password)', value: 'basic' },
      { label: 'Custom header', value: 'header' }
    ]
  },
  { key: 'authToken', label: 'Token / value', type: 'secret', advanced: true, showIf: { field: 'authType', in: ['bearer', 'header'] } },
  { key: 'authHeaderName', label: 'Header name', type: 'string', advanced: true, placeholder: 'X-Api-Key', showIf: { field: 'authType', in: ['header'] } },
  { key: 'authUser', label: 'Username', type: 'string', advanced: true, showIf: { field: 'authType', in: ['basic'] } },
  { key: 'authPass', label: 'Password', type: 'secret', advanced: true, showIf: { field: 'authType', in: ['basic'] } },
  { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', default: 10000, advanced: true }
]

export const pingIntegration: Integration = {
  id: 'ping',
  name: 'Ping / HTTP request',
  icon: 'i-lucide-activity',
  connectionSchema: [], // no stored credentials — everything is supplied per step
  triggers: [
    {
      id: 'responseMatches',
      name: 'When an endpoint responds (or stops responding)',
      description:
        'Pings a URL on every check and fires when the response passes the chosen test. Like other poll triggers it fires on EVERY check while the test passes — add a state cooldown/threshold gate in the flow if you want it to act once on an up→down transition. The full response is exposed as {{ trigger.status }} / {{ trigger.body }} / {{ trigger.json }}.',
      kind: 'poll',
      needsConnection: false,
      configSchema: [
        ...REQUEST_FIELDS,
        {
          key: 'fireWhen', label: 'Fires when…', type: 'select', default: 'unreachable',
          options: [
            { label: 'unreachable (down / connection failed)', value: 'unreachable' },
            { label: 'reachable (got any response)', value: 'reachable' },
            { label: 'status code is not 2xx/3xx', value: 'notOk' },
            { label: 'status code equals…', value: 'statusEq' },
            { label: 'body contains…', value: 'bodyContains' }
          ]
        },
        { key: 'expectStatus', label: 'Status code', type: 'number', placeholder: '500', showIf: { field: 'fireWhen', in: ['statusEq'] } },
        { key: 'expectBody', label: 'Body contains', type: 'string', placeholder: 'unhealthy', showIf: { field: 'fireWhen', in: ['bodyContains'] } }
      ],
      poll: async (ctx: TriggerContext) => {
        const req = buildRequest(ctx.config)
        const res = await execute(req, ctx.signal)
        const fireWhen = String(ctx.config.fireWhen ?? 'unreachable')

        let fire = false
        switch (fireWhen) {
          case 'unreachable':
            fire = res.error != null
            break
          case 'reachable':
            fire = res.error == null
            break
          case 'notOk':
            fire = res.error != null || res.status < 200 || res.status >= 400
            break
          case 'statusEq':
            fire = res.error == null && res.status === Number(ctx.config.expectStatus)
            break
          case 'bodyContains':
            fire = res.error == null && res.body.includes(String(ctx.config.expectBody ?? ''))
            break
        }
        if (!fire) return null

        return {
          url: res.url,
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          body: res.body,
          json: res.json,
          headers: res.headers,
          durationMs: res.durationMs,
          error: res.error
        }
      }
    }
  ],
  actions: [
    {
      id: 'request',
      name: 'Make an HTTP request',
      description:
        'Sends an HTTP request to a URL with an optional body, headers and auth, and returns the response. Follow it with a condition step to evaluate the result, e.g. {{ steps.<id>.status }} eq 200 or {{ steps.<id>.json.status }} contains "ok".',
      needsConnection: false,
      inputSchema: [...REQUEST_FIELDS],
      outputKeys: ['ok', 'status', 'statusText', 'body', 'json', 'headers', 'durationMs', 'url', 'error'],
      run: async (ctx: ActionContext) => {
        const req = buildRequest(ctx.input)
        const res = await execute(req, ctx.signal)
        if (res.error) {
          ctx.log(`ping ${req.method} ${req.url} → ${res.error}`)
          // a network-level failure is a real error for an action (vs. the poll trigger,
          // which treats "down" as a normal outcome). Surface it so the step is marked failed.
          throw new Error(res.error)
        }
        ctx.log(`ping ${req.method} ${req.url} → ${res.status} (${res.durationMs}ms)`)
        return {
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          body: res.body,
          json: res.json,
          headers: res.headers,
          durationMs: res.durationMs,
          url: res.url,
          error: null
        }
      }
    },
    {
      // Powers the Monitoring page for a constant-ping monitor. Returns a
      // normalized MonitorSnapshot (kind: "status"). It does NOT itself ping —
      // the background loop (server/utils/pingMonitor.ts) does that on the
      // monitor's interval. The snapshot just reads the most recent recorded
      // samples: the latest one drives the up/down badge, and a recent window
      // of latencies is attached as `raw` for the detail view's sparkline.
      //
      // The monitor's id is threaded in via the reserved `_monitorId` input key
      // (injected by the snapshot/test endpoints) since the snapshot action only
      // receives the monitor's targetConfig, not the row.
      id: 'monitorSnapshot',
      name: 'Ping monitor snapshot',
      description: 'Returns the latest up/down + recent latency for a constant-ping monitor, used by the Monitoring page.',
      needsConnection: false,
      inputSchema: MONITOR_TARGET_FIELDS,
      outputKeys: ['kind', 'state', 'label', 'detail', 'raw'],
      run: async (ctx: ActionContext) => {
        const monitorId = String(ctx.input._monitorId ?? '')
        const successRule = String(ctx.input.successRule ?? '2xx3xx')
        const url = String(ctx.input.url ?? '')

        // No monitor id (e.g. the "Test" button, which runs before the monitor
        // exists) → do a single live ping so the user still gets a reading.
        if (!monitorId) {
          const res = await execute(buildRequest(ctx.input), ctx.signal)
          const up = pingSuccess(res, successRule)
          const snap: MonitorSnapshot = {
            kind: 'status',
            state: up ? 'up' : 'down',
            label: up ? 'Up' : 'Down',
            detail: res.error
              ? res.error
              : `HTTP ${res.status}${res.durationMs ? ` · ${res.durationMs}ms` : ''}`,
            raw: { samples: res.error ? [] : [{ ts: 0, latencyMs: res.durationMs, ok: up, status: res.status }] }
          }
          return snap as unknown as Record<string, unknown>
        }

        const samples = await readPingSamples(monitorId, 120)
        const latest = samples.at(-1) ?? null

        if (!latest) {
          const snap: MonitorSnapshot = {
            kind: 'status',
            state: 'pending',
            label: 'Pending',
            detail: `Waiting for the first ping of ${url}…`,
            raw: { samples: [] }
          }
          return snap as unknown as Record<string, unknown>
        }

        // success rate over the recent window, for the detail line
        const okCount = samples.filter(s => s.ok).length
        const rate = Math.round((okCount / samples.length) * 100)
        const lastLatency = latest.latencyMs

        const snap: MonitorSnapshot = {
          kind: 'status',
          state: latest.ok ? 'up' : 'down',
          label: latest.ok ? 'Up' : 'Down',
          detail: latest.ok
            ? `HTTP ${latest.status}${lastLatency != null ? ` · ${lastLatency}ms` : ''} · ${rate}% over last ${samples.length}`
            : `${latest.error || `HTTP ${latest.status}`} · ${rate}% up over last ${samples.length}`,
          // the detail view reads `raw.samples` for the latency sparkline
          raw: {
            samples: samples.map(s => ({ ts: s.ts, latencyMs: s.latencyMs, ok: s.ok, status: s.status })),
            successRate: rate
          }
        }
        return snap as unknown as Record<string, unknown>
      }
    }
  ],
  monitoring: {
    kind: 'status',
    snapshotAction: 'monitorSnapshot',
    targetSchema: MONITOR_TARGET_FIELDS
  }
}
