import type { ActionContext, Integration } from '../engine/types'

// Read per-call (not a module-load constant) so it can be overridden at runtime
// and in tests. Connection config can also override it via config.apiBase.
function apiBase(ctx?: ActionContext): string {
  return (
    String(ctx?.connection?.config.apiBase ?? '')
    || process.env.NUXT_BUNNY_API_BASE
    || 'https://api.bunny.net'
  )
}

interface BunnyRecord {
  Id: number
  Type: number // 0 = A, 2 = CNAME
  Name: string
  Value: string
  Disabled: boolean
}
interface BunnyZone {
  Id: number
  Domain: string
  Records: BunnyRecord[]
}

function key(ctx: ActionContext): string {
  const k = String(ctx.connection?.config.apiKey ?? '')
  if (!k) throw new Error('Bunny connection has no API key')
  return k
}

async function fetchZone(base: string, apiKey: string, zoneId: number, signal: AbortSignal): Promise<BunnyZone> {
  const res = await fetch(`${base}/dnszone/${zoneId}`, {
    headers: { AccessKey: apiKey, Accept: 'application/json' },
    signal
  })
  if (!res.ok) throw new Error(`Bunny GET zone ${zoneId}: ${res.status}`)
  return res.json() as Promise<BunnyZone>
}

async function setDisabled(
  base: string,
  apiKey: string,
  zoneId: number,
  recordId: number,
  disabled: boolean,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${base}/dnszone/${zoneId}/records/${recordId}`, {
    method: 'POST',
    headers: { 'AccessKey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Disabled: disabled }),
    signal
  })
  if (!res.ok && res.status !== 204) {
    const body = await res.text().catch(() => '')
    throw new Error(`Bunny update ${recordId}: ${res.status} ${body}`)
  }
}

/** records of an A name within a zone that match a recordName ("@" = apex) */
function aRecordsForName(zone: BunnyZone, recordName: string): BunnyRecord[] {
  const want = recordName === '@' ? '' : recordName
  return (zone.Records || []).filter(r => r.Type === 0 && (r.Name || '') === want)
}

export const bunnyIntegration: Integration = {
  id: 'bunny',
  name: 'Bunny DNS',
  img: 'https://img.logo.dev/name/bunny?token=pk_IfeEO2FvQ2uFp8XsvXUPUw&retina=true',
  connectionSchema: [
    {
      key: 'apiKey',
      label: 'Bunny API key',
      type: 'secret',
      required: true,
      help: 'Account API key from your Bunny.net dashboard.'
    }
  ],
  testConnection: async (config, signal) => {
    const apiKey = String(config.apiKey ?? '')
    const base = String(config.apiBase ?? '') || process.env.NUXT_BUNNY_API_BASE || 'https://api.bunny.net'
    if (!apiKey) return { ok: false, message: 'API key is required' }
    try {
      // cheap authed read: list DNS zones (page 1)
      const res = await fetch(`${base}/dnszone?page=1&perPage=1`, {
        headers: { AccessKey: apiKey, Accept: 'application/json' },
        signal
      })
      if (res.status === 401) return { ok: false, message: 'API key rejected (401)' }
      if (!res.ok) return { ok: false, message: `Bunny returned ${res.status}` }
      return { ok: true, message: 'Connected to Bunny' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not reach Bunny' }
    }
  },
  triggers: [],
  actions: [
    {
      id: 'listRecords',
      name: 'List DNS records',
      description: 'Returns the A records for a name in a Bunny DNS zone.',
      needsConnection: true,
      inputSchema: [
        { key: 'zoneId', label: 'Zone ID', type: 'number', required: true },
        { key: 'recordName', label: 'Record name (or @)', type: 'string', required: true, default: '@' }
      ],
      outputKeys: ['records', 'activeIp', 'count'],
      run: async (ctx) => {
        const zone = await fetchZone(apiBase(ctx), key(ctx), Number(ctx.input.zoneId), ctx.signal)
        const records = aRecordsForName(zone, String(ctx.input.recordName ?? '@')).map(r => ({
          id: r.Id,
          ip: r.Value,
          disabled: r.Disabled
        }))
        const active = records.find(r => !r.disabled)
        ctx.log(`zone ${ctx.input.zoneId}: ${records.length} A record(s), active=${active?.ip ?? 'none'}`)
        return { records, activeIp: active?.ip ?? null, count: records.length }
      }
    },
    {
      id: 'disableRecord',
      name: 'Disable a DNS record',
      description: 'Disables a Bunny DNS record by its record ID.',
      needsConnection: true,
      inputSchema: [
        { key: 'zoneId', label: 'Zone ID', type: 'number', required: true },
        { key: 'recordId', label: 'Record ID', type: 'number', required: true }
      ],
      outputKeys: ['disabled'],
      run: async (ctx) => {
        await setDisabled(apiBase(ctx), key(ctx), Number(ctx.input.zoneId), Number(ctx.input.recordId), true, ctx.signal)
        ctx.log(`disabled record ${ctx.input.recordId}`)
        return { disabled: true }
      }
    },
    {
      id: 'enableRecord',
      name: 'Enable a DNS record',
      description: 'Enables a Bunny DNS record by its record ID.',
      needsConnection: true,
      inputSchema: [
        { key: 'zoneId', label: 'Zone ID', type: 'number', required: true },
        { key: 'recordId', label: 'Record ID', type: 'number', required: true }
      ],
      outputKeys: ['enabled'],
      run: async (ctx) => {
        await setDisabled(apiBase(ctx), key(ctx), Number(ctx.input.zoneId), Number(ctx.input.recordId), false, ctx.signal)
        ctx.log(`enabled record ${ctx.input.recordId}`)
        return { enabled: true }
      }
    },
    {
      id: 'swapActive',
      name: 'Swap active record (failover)',
      description:
        'Disables the record serving the old IP and enables the record serving the new IP, in one step.',
      needsConnection: true,
      inputSchema: [
        { key: 'zoneId', label: 'Zone ID', type: 'number', required: true },
        { key: 'fromRecordId', label: 'Disable record ID', type: 'number', required: true },
        { key: 'toRecordId', label: 'Enable record ID', type: 'number', required: true }
      ],
      outputKeys: ['swapped'],
      run: async (ctx) => {
        const apiKey = key(ctx)
        const b = apiBase(ctx)
        const zoneId = Number(ctx.input.zoneId)
        await setDisabled(b, apiKey, zoneId, Number(ctx.input.fromRecordId), true, ctx.signal)
        await setDisabled(b, apiKey, zoneId, Number(ctx.input.toRecordId), false, ctx.signal)
        ctx.log(`swapped ${ctx.input.fromRecordId} → ${ctx.input.toRecordId}`)
        return { swapped: true }
      }
    }
  ]
}
