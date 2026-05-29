import type { AnalyticsScriptTag, Integration, MonitorSnapshot } from '../engine/types'

/**
 * Plausible Analytics — privacy-friendly, cookieless web analytics. Works with
 * both the hosted service (https://plausible.io) and SELF-HOSTED instances: the
 * `baseUrl` is configurable, and both the tracking script (`/js/script.js`) and
 * the Stats API live under it.
 *
 * Two capabilities:
 *  - webAnalytics → injects the tracking script on shared (public) boards so
 *    visits are counted. Needs only the site domain (public-safe).
 *  - monitoring   → reads visitor/pageview figures back via the Stats API,
 *    rendered as "stats" cards on the Monitoring page. Needs an API key.
 *
 * The API key is OPTIONAL: a connection with just a base URL + domain can still
 * track a board; the key is only required to read stats back.
 */

const PERIOD_OPTIONS = [
  { label: 'Today', value: 'day' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'This month', value: 'month' },
  { label: 'Last 6 months', value: '6mo' },
  { label: 'Last 12 months', value: '12mo' }
]

function baseUrlOf(config: Record<string, unknown>): string {
  return (String(config.baseUrl ?? '') || 'https://plausible.io').replace(/\/$/, '')
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
}

interface AggregateResult {
  visitors?: number | null
  pageviews?: number | null
  bounce_rate?: number | null
  visit_duration?: number | null
}

/** Read the Stats API "aggregate" endpoint for the standard metric set. */
async function fetchAggregate(
  config: Record<string, unknown>,
  period: string,
  signal: AbortSignal
): Promise<AggregateResult> {
  const baseUrl = baseUrlOf(config)
  const siteId = String(config.siteId ?? '')
  const apiKey = String(config.apiKey ?? '')
  if (!siteId) throw new Error('Plausible connection has no site domain')
  if (!apiKey) throw new Error('Plausible connection has no API key — add one to read stats')

  const metrics = 'visitors,pageviews,bounce_rate,visit_duration'
  const url = `${baseUrl}/api/v1/stats/aggregate?site_id=${encodeURIComponent(siteId)}&period=${encodeURIComponent(period)}&metrics=${metrics}`
  const res = await fetch(url, { headers: authHeaders(apiKey), signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Plausible aggregate ${res.status}${text ? ` — ${text.slice(0, 160)}` : ''}`)
  }
  const json = await res.json().catch(() => null) as { results?: Record<string, { value?: number }> } | null
  const r = json?.results ?? {}
  return {
    visitors: r.visitors?.value ?? null,
    pageviews: r.pageviews?.value ?? null,
    bounce_rate: r.bounce_rate?.value ?? null,
    visit_duration: r.visit_duration?.value ?? null
  }
}

/** Current visitors on the site right now (Stats API realtime endpoint). */
async function fetchRealtime(config: Record<string, unknown>, signal: AbortSignal): Promise<number | null> {
  const baseUrl = baseUrlOf(config)
  const siteId = String(config.siteId ?? '')
  const apiKey = String(config.apiKey ?? '')
  if (!siteId || !apiKey) return null
  const url = `${baseUrl}/api/v1/stats/realtime/visitors?site_id=${encodeURIComponent(siteId)}`
  const res = await fetch(url, { headers: authHeaders(apiKey), signal })
  if (!res.ok) return null
  const v = await res.json().catch(() => null)
  return typeof v === 'number' ? v : null
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m ? `${m}m ${s}s` : `${s}s`
}

export const plausibleIntegration: Integration = {
  id: 'plausible',
  name: 'Plausible Analytics',
  icon: 'i-simple-icons-plausibleanalytics',
  connectionSchema: [
    {
      key: 'baseUrl',
      label: 'Plausible URL',
      type: 'string',
      default: 'https://plausible.io',
      placeholder: 'https://plausible.io',
      help: 'Use your self-hosted Plausible URL here if you don\'t use the hosted service.'
    },
    {
      key: 'siteId',
      label: 'Site domain',
      type: 'string',
      required: true,
      placeholder: 'example.com',
      help: 'The site domain exactly as added in Plausible (e.g. example.com).'
    },
    {
      key: 'apiKey',
      label: 'Stats API key',
      type: 'secret',
      placeholder: 'plausible API key',
      help: 'Optional. Needed to read stats back (metrics/monitoring). Not required just to track a board. Create one in Plausible → Settings → API Keys.'
    }
  ],
  testConnection: async (config, signal) => {
    const siteId = String(config.siteId ?? '')
    const apiKey = String(config.apiKey ?? '')
    if (!siteId) return { ok: false, message: 'Site domain is required' }
    if (!apiKey) return { ok: true, message: 'Tracking ready (no API key — stats/metrics disabled)' }
    try {
      const agg = await fetchAggregate(config, '30d', signal)
      return { ok: true, message: `Connected — ${agg.visitors ?? 0} visitors in the last 30 days` }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reach Plausible'
      return { ok: false, message: /401|403/.test(msg) ? 'API key rejected' : msg }
    }
  },
  triggers: [],
  actions: [
    {
      id: 'getAggregate',
      name: 'Get aggregate stats',
      description: 'Returns visitors, pageviews, bounce rate and average visit duration for a period.',
      needsConnection: true,
      inputSchema: [
        { key: 'period', label: 'Period', type: 'select', default: '30d', options: PERIOD_OPTIONS }
      ],
      outputKeys: ['visitors', 'pageviews', 'bounceRate', 'visitDuration'],
      run: async (ctx) => {
        const period = String(ctx.input.period ?? '30d')
        const agg = await fetchAggregate(ctx.connection!.config, period, ctx.signal)
        ctx.log(`plausible aggregate ${period} → ${agg.visitors ?? 0} visitors`)
        return {
          visitors: agg.visitors,
          pageviews: agg.pageviews,
          bounceRate: agg.bounce_rate,
          visitDuration: agg.visit_duration
        }
      }
    },
    {
      id: 'getRealtimeVisitors',
      name: 'Get current visitors',
      description: 'Returns the number of visitors currently on the site.',
      needsConnection: true,
      inputSchema: [],
      outputKeys: ['visitors'],
      run: async (ctx) => {
        const visitors = await fetchRealtime(ctx.connection!.config, ctx.signal)
        ctx.log(`plausible realtime → ${visitors ?? 0} visitors`)
        return { visitors }
      }
    },
    {
      // Powers the Monitoring page. Returns a normalized MonitorSnapshot
      // (kind: "stats"). Input schema IS the monitor's targetConfig.
      id: 'monitorSnapshot',
      name: 'Analytics snapshot',
      description: 'Returns a normalized analytics snapshot (visitors, pageviews, live users) for the Monitoring page.',
      needsConnection: true,
      inputSchema: [
        { key: 'period', label: 'Period', type: 'select', default: '30d', options: PERIOD_OPTIONS }
      ],
      outputKeys: ['kind', 'stats', 'detail', 'raw'],
      run: async (ctx) => {
        const period = String(ctx.input.period ?? '30d')
        const [agg, live] = await Promise.all([
          fetchAggregate(ctx.connection!.config, period, ctx.signal),
          fetchRealtime(ctx.connection!.config, ctx.signal)
        ])
        const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label ?? period
        const snapshot: MonitorSnapshot = {
          kind: 'stats',
          stats: [
            { key: 'live', label: 'Live now', icon: 'i-lucide-radio', value: live, unit: 'visitors' },
            { key: 'visitors', label: 'Visitors', icon: 'i-lucide-users', value: agg.visitors ?? null },
            { key: 'pageviews', label: 'Pageviews', icon: 'i-lucide-eye', value: agg.pageviews ?? null },
            { key: 'bounce', label: 'Bounce rate', icon: 'i-lucide-undo-2', value: agg.bounce_rate ?? null, unit: '%' },
            { key: 'duration', label: 'Avg. visit', icon: 'i-lucide-timer', value: fmtDuration(agg.visit_duration) }
          ],
          detail: `${periodLabel} · ${String(ctx.connection!.config.siteId ?? '')}`,
          raw: { ...agg, live }
        }
        return snapshot as unknown as Record<string, unknown>
      }
    }
  ],
  monitoring: {
    kind: 'stats',
    snapshotAction: 'monitorSnapshot',
    targetSchema: [
      { key: 'period', label: 'Period', type: 'select', default: '30d', options: PERIOD_OPTIONS }
    ]
  },
  webAnalytics: {
    scriptTags: (config): AnalyticsScriptTag[] => {
      const baseUrl = baseUrlOf(config)
      const siteId = String(config.siteId ?? '')
      if (!siteId) return []
      return [
        {
          src: `${baseUrl}/js/script.js`,
          defer: true,
          attrs: { 'data-domain': siteId }
        }
      ]
    }
  }
}
