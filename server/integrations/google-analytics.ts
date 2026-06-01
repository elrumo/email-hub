import type { AnalyticsScriptTag, Integration, MonitorSnapshot } from '../engine/types'

/**
 * Google Analytics 4. Two capabilities:
 *  - webAnalytics → injects the gtag.js tracking snippet on shared (public)
 *    boards so visits are counted. Needs only the Measurement ID (public-safe,
 *    e.g. G-XXXXXXXXXX).
 *  - monitoring   → reads figures back via the GA4 Data API (Analytics Data
 *    API v1beta), rendered as "stats" cards. The Data API needs a Google Cloud
 *    SERVICE ACCOUNT (with the Viewer role on the GA property) plus the numeric
 *    property id. We sign a JWT with the service account key and exchange it for
 *    a short-lived OAuth access token (no extra deps — Bun's WebCrypto signs it).
 *
 * Tracking works with just the Measurement ID; the property id + service account
 * key are only required to read stats back.
 */

const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const TOKEN_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

const RANGE_OPTIONS = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7daysAgo' },
  { label: 'Last 28 days', value: '28daysAgo' },
  { label: 'Last 90 days', value: '90daysAgo' }
]

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

function parseServiceAccount(raw: unknown): ServiceAccount {
  let obj: unknown = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      throw new Error('Service account key must be the full JSON key file')
    }
  }
  const sa = obj as Partial<ServiceAccount>
  if (!sa?.client_email || !sa?.private_key) {
    throw new Error('Service account JSON is missing client_email / private_key')
  }
  return { client_email: sa.client_email, private_key: sa.private_key, token_uri: sa.token_uri }
}

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Import a PEM PKCS#8 private key for RS256 signing via WebCrypto. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

// Cache access tokens in-memory per service-account email so we don't re-sign +
// round-trip on every snapshot. Tokens last ~1h; we expire a little early.
const tokenCache = new Map<string, { token: string, exp: number }>()

async function getAccessToken(sa: ServiceAccount, signal: AbortSignal): Promise<string> {
  const cached = tokenCache.get(sa.client_email)
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token

  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token'
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: TOKEN_SCOPE,
    aud: tokenUri,
    iat: now,
    exp: now + 3600
  }))
  const signingInput = `${header}.${claim}`
  const key = await importPrivateKey(sa.private_key)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  const jwt = `${signingInput}.${base64url(sig)}`

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }),
    signal
  })
  const json = await res.json().catch(() => null) as { access_token?: string, expires_in?: number, error_description?: string } | null
  if (!res.ok || !json?.access_token) {
    throw new Error(`Google token exchange ${res.status}${json?.error_description ? ` — ${json.error_description}` : ''}`)
  }
  tokenCache.set(sa.client_email, { token: json.access_token, exp: now + (json.expires_in ?? 3600) })
  return json.access_token
}

function propertyPath(config: Record<string, unknown>): string {
  const raw = String(config.propertyId ?? '').trim()
  if (!raw) throw new Error('GA connection has no property id')
  // accept either "123456789" or "properties/123456789"
  return raw.startsWith('properties/') ? raw : `properties/${raw}`
}

async function dataApi(
  config: Record<string, unknown>,
  method: 'runReport' | 'runRealtimeReport',
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  const sa = parseServiceAccount(config.serviceAccountKey)
  const token = await getAccessToken(sa, signal)
  const url = `${DATA_API}/${propertyPath(config)}:${method}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GA Data API ${method} ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`)
  }
  return await res.json() as Record<string, unknown>
}

/** Sum a single-metric report's first metric column across all rows. */
function sumMetric(report: Record<string, unknown>, index = 0): number {
  const rows = (report.rows as Array<{ metricValues?: Array<{ value?: string }> }> | undefined) ?? []
  let total = 0
  for (const r of rows) {
    const v = Number(r.metricValues?.[index]?.value)
    if (Number.isFinite(v)) total += v
  }
  return total
}

async function fetchActiveUsers(config: Record<string, unknown>, signal: AbortSignal): Promise<number | null> {
  try {
    const report = await dataApi(config, 'runRealtimeReport', { metrics: [{ name: 'activeUsers' }] }, signal)
    return sumMetric(report)
  } catch {
    return null
  }
}

export const googleAnalyticsIntegration: Integration = {
  id: 'google-analytics',
  name: 'Google Analytics',
  img: 'https://images.seeklogo.com/logo-png/32/1/google-analytics-logo-png_seeklogo-325027.png',
  connectionSchema: [
    {
      key: 'measurementId',
      label: 'Measurement ID',
      type: 'string',
      required: true,
      placeholder: 'G-XXXXXXXXXX',
      help: 'Your GA4 Measurement ID (Admin → Data Streams). Used to track boards.'
    },
    {
      key: 'propertyId',
      label: 'Property ID',
      type: 'string',
      advanced: true,
      placeholder: '123456789',
      help: 'Numeric GA4 property id (Admin → Property Settings). Needed to read stats back.'
    },
    {
      key: 'serviceAccountKey',
      label: 'Service account key (JSON)',
      type: 'secret',
      advanced: true,
      help: 'Paste the full service-account JSON key. Grant the service account the "Viewer" role on the GA property. Needed for metrics/monitoring only.'
    }
  ],
  testConnection: async (config, signal) => {
    const measurementId = String(config.measurementId ?? '')
    if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
      return { ok: false, message: 'Measurement ID should look like G-XXXXXXXXXX' }
    }
    const hasDataApi = String(config.propertyId ?? '') && String(config.serviceAccountKey ?? '')
    if (!hasDataApi) {
      return { ok: true, message: 'Tracking ready (add a property id + service account for stats)' }
    }
    try {
      const report = await dataApi(config, 'runReport', {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }]
      }, signal)
      return { ok: true, message: `Connected — ${sumMetric(report)} active users in the last 7 days` }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reach the GA Data API'
      return { ok: false, message: /401|403|PERMISSION/i.test(msg) ? 'Service account rejected — check the property access' : msg }
    }
  },
  triggers: [],
  actions: [
    {
      id: 'runReport',
      name: 'Run a report',
      description: 'Runs a GA4 Data API report for one metric over a date range and returns the total.',
      needsConnection: true,
      inputSchema: [
        { key: 'metric', label: 'Metric', type: 'string', default: 'activeUsers', placeholder: 'activeUsers', help: 'A GA4 metric name, e.g. activeUsers, screenPageViews, sessions.' },
        { key: 'startDate', label: 'Since', type: 'select', default: '28daysAgo', options: RANGE_OPTIONS }
      ],
      outputKeys: ['metric', 'total', 'raw'],
      run: async (ctx) => {
        const metric = String(ctx.input.metric ?? 'activeUsers')
        const startDate = String(ctx.input.startDate ?? '28daysAgo')
        const report = await dataApi(ctx.connection!.config, 'runReport', {
          dateRanges: [{ startDate, endDate: 'today' }],
          metrics: [{ name: metric }]
        }, ctx.signal)
        const total = sumMetric(report)
        ctx.log(`ga ${metric} since ${startDate} → ${total}`)
        return { metric, total, raw: report }
      }
    },
    {
      id: 'getActiveUsers',
      name: 'Get active users (realtime)',
      description: 'Returns the number of users active on the property right now.',
      needsConnection: true,
      inputSchema: [],
      outputKeys: ['activeUsers'],
      run: async (ctx) => {
        const activeUsers = await fetchActiveUsers(ctx.connection!.config, ctx.signal)
        ctx.log(`ga realtime → ${activeUsers ?? 0} active users`)
        return { activeUsers }
      }
    },
    {
      // Powers the Monitoring page. Returns a normalized MonitorSnapshot
      // (kind: "stats"). Input schema IS the monitor's targetConfig.
      id: 'monitorSnapshot',
      name: 'Analytics snapshot',
      description: 'Returns a normalized analytics snapshot (active users, total users, pageviews) for the Monitoring page.',
      needsConnection: true,
      inputSchema: [
        { key: 'startDate', label: 'Since', type: 'select', default: '28daysAgo', options: RANGE_OPTIONS }
      ],
      outputKeys: ['kind', 'stats', 'detail', 'raw'],
      run: async (ctx) => {
        const config = ctx.connection!.config
        const startDate = String(ctx.input.startDate ?? '28daysAgo')
        const [report, live] = await Promise.all([
          dataApi(config, 'runReport', {
            dateRanges: [{ startDate, endDate: 'today' }],
            metrics: [{ name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }]
          }, ctx.signal),
          fetchActiveUsers(config, ctx.signal)
        ])
        const rangeLabel = RANGE_OPTIONS.find(r => r.value === startDate)?.label ?? startDate
        const snapshot: MonitorSnapshot = {
          kind: 'stats',
          stats: [
            { key: 'live', label: 'Active now', icon: 'i-lucide-radio', value: live, unit: 'users' },
            { key: 'users', label: 'Users', icon: 'i-lucide-users', value: sumMetric(report, 0) },
            { key: 'pageviews', label: 'Pageviews', icon: 'i-lucide-eye', value: sumMetric(report, 1) },
            { key: 'sessions', label: 'Sessions', icon: 'i-lucide-mouse-pointer-click', value: sumMetric(report, 2) }
          ],
          detail: `${rangeLabel} · ${String(config.measurementId ?? '')}`,
          raw: { report, live }
        }
        return snapshot as unknown as Record<string, unknown>
      }
    }
  ],
  monitoring: {
    kind: 'stats',
    snapshotAction: 'monitorSnapshot',
    targetSchema: [
      { key: 'startDate', label: 'Since', type: 'select', default: '28daysAgo', options: RANGE_OPTIONS }
    ]
  },
  webAnalytics: {
    scriptTags: (config): AnalyticsScriptTag[] => {
      const measurementId = String(config.measurementId ?? '')
      if (!/^G-[A-Z0-9]+$/i.test(measurementId)) return []
      return [
        { src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`, async: true },
        {
          innerHTML:
            `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}`
            + `gtag('js',new Date());gtag('config',${JSON.stringify(measurementId)});`
        }
      ]
    }
  }
}
