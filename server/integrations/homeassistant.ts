import type { Integration } from '../engine/types'

/**
 * Home Assistant (https://www.home-assistant.io). The connection holds the
 * instance base URL + a long-lived access token (Profile → Security → Long-lived
 * access tokens). Everything goes through the HA REST API with Bearer auth:
 * https://developers.home-assistant.io/docs/api/rest/
 *
 * HTTP integration — no client lifecycle, just `fetch` inside `run`.
 */
function baseUrl(config: Record<string, unknown>): string {
  const raw = String(config.baseUrl ?? '').trim()
  if (!raw) throw new Error('Home Assistant connection has no base URL')
  // tolerate a trailing slash so `${base}/api/...` never doubles up
  return raw.replace(/\/+$/, '')
}

function token(config: Record<string, unknown>): string {
  const t = String(config.token ?? '')
  if (!t) throw new Error('Home Assistant connection has no access token')
  return t
}

async function call<T = unknown>(
  config: Record<string, unknown>,
  method: 'GET' | 'POST',
  path: string,
  body: Record<string, unknown> | null,
  signal: AbortSignal
): Promise<{ status: number, data: T }> {
  const res = await fetch(`${baseUrl(config)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token(config)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal
  })
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'message' in data)
      ? String((data as { message?: unknown }).message)
      : `Home Assistant ${method} ${path} → ${res.status}`
    throw new Error(res.status === 401 ? 'Access token rejected (401)' : msg)
  }
  return { status: res.status, data: data as T }
}

export const homeAssistantIntegration: Integration = {
  id: 'homeassistant',
  name: 'Home Assistant',
  icon: 'i-simple-icons-homeassistant',
  connectionSchema: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'string',
      required: true,
      placeholder: 'http://homeassistant.local:8123',
      help: 'Your Home Assistant instance URL (no trailing /api).'
    },
    {
      key: 'token',
      label: 'Long-lived access token',
      type: 'secret',
      required: true,
      help: 'Create one in Home Assistant: your profile → Security → Long-lived access tokens.'
    }
  ],
  testConnection: async (config, signal) => {
    if (!String(config.baseUrl ?? '').trim()) return { ok: false, message: 'Base URL is required' }
    if (!String(config.token ?? '')) return { ok: false, message: 'Access token is required' }
    try {
      // GET /api/ returns { message: "API running." } when authed & reachable
      const { data } = await call<{ message?: string }>(config, 'GET', '/api/', null, signal)
      return { ok: true, message: data?.message ? `Connected — ${data.message}` : 'Connected' }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reach Home Assistant'
      return { ok: false, message: msg }
    }
  },
  triggers: [
    {
      id: 'entityStateMatches',
      name: 'When an entity matches a state',
      description:
        'Polls one entity and fires while its current state matches the chosen test. Like other poll triggers it fires on EVERY check while the test passes (e.g. each tick the door stays open) — add a state cooldown/threshold gate in the flow if you want it to act once. The entity\'s full state is exposed as {{ trigger.state }} / {{ trigger.attributes }}.',
      kind: 'poll',
      needsConnection: true,
      configSchema: [
        { key: 'entityId', label: 'Entity ID', type: 'string', required: true, placeholder: 'binary_sensor.front_door' },
        { key: 'op', label: 'Fires when state…', type: 'select', default: 'eq', options: [
          { label: 'equals', value: 'eq' },
          { label: 'does not equal', value: 'ne' },
          { label: 'is greater than (number)', value: 'gt' },
          { label: 'is less than (number)', value: 'lt' },
          { label: 'changed at all (fires every check)', value: 'any' }
        ] },
        { key: 'value', label: 'Compared value', type: 'string', placeholder: 'on', help: 'The state (or number) to compare against. Ignored for "changed at all".', showIf: { field: 'op', in: ['eq', 'ne', 'gt', 'lt'] } }
      ],
      poll: async (ctx) => {
        const cfg = ctx.connection!.config
        const entityId = String(ctx.config.entityId ?? '').trim()
        if (!entityId) return null
        let data: { state?: string, attributes?: Record<string, unknown>, last_changed?: string }
        try {
          const r = await call<typeof data>(cfg, 'GET', `/api/states/${encodeURIComponent(entityId)}`, null, ctx.signal)
          data = r.data
        } catch {
          return null // entity missing / HA unreachable → don't fire
        }
        const state = String(data?.state ?? '')
        const op = String(ctx.config.op ?? 'eq')
        const target = String(ctx.config.value ?? '')
        const num = Number(state)
        const tnum = Number(target)
        let fire = false
        switch (op) {
          case 'any': fire = true; break
          case 'eq': fire = state === target; break
          case 'ne': fire = state !== target; break
          case 'gt': fire = !Number.isNaN(num) && !Number.isNaN(tnum) && num > tnum; break
          case 'lt': fire = !Number.isNaN(num) && !Number.isNaN(tnum) && num < tnum; break
        }
        if (!fire) return null
        return {
          entityId,
          state: data?.state ?? null,
          attributes: data?.attributes ?? {},
          lastChanged: data?.last_changed ?? null
        }
      }
    }
  ],
  actions: [
    {
      id: 'callService',
      name: 'Call a service',
      description: 'Calls a Home Assistant service, e.g. light.turn_on or homeassistant.restart.',
      needsConnection: true,
      inputSchema: [
        { key: 'domain', label: 'Domain', type: 'string', required: true, placeholder: 'light', help: 'Service domain, e.g. light, switch, scene, notify.' },
        { key: 'service', label: 'Service', type: 'string', required: true, placeholder: 'turn_on' },
        { key: 'entityId', label: 'Entity ID', type: 'string', placeholder: 'light.living_room', help: 'Target entity. Comma-separate multiple. Optional if the service needs none.' },
        { key: 'data', label: 'Extra service data', type: 'keyValue', help: 'Optional key/value pairs merged into the service call (e.g. brightness=255).' }
      ],
      outputKeys: ['changedEntities', 'count'],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const domain = String(ctx.input.domain ?? '').trim()
        const service = String(ctx.input.service ?? '').trim()
        if (!domain || !service) throw new Error('domain and service are required')
        const entityId = String(ctx.input.entityId ?? '').trim()
        const extra = (ctx.input.data && typeof ctx.input.data === 'object') ? ctx.input.data as Record<string, unknown> : {}
        const body: Record<string, unknown> = { ...extra }
        if (entityId) body.entity_id = entityId.includes(',') ? entityId.split(',').map(s => s.trim()).filter(Boolean) : entityId
        const { data } = await call<Array<{ entity_id?: string }>>(
          cfg, 'POST', `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, body, ctx.signal
        )
        const changed = Array.isArray(data) ? data.map(s => s.entity_id).filter(Boolean) : []
        ctx.log(`home assistant → ${domain}.${service}${entityId ? ` (${entityId})` : ''} — ${changed.length} changed`)
        return { changedEntities: changed, count: changed.length }
      }
    },
    {
      id: 'getState',
      name: 'Get entity state',
      description: 'Reads the current state and attributes of one entity.',
      needsConnection: true,
      inputSchema: [
        { key: 'entityId', label: 'Entity ID', type: 'string', required: true, placeholder: 'sensor.outside_temperature' }
      ],
      outputKeys: ['state', 'attributes', 'lastChanged'],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const entityId = String(ctx.input.entityId ?? '').trim()
        if (!entityId) throw new Error('entityId is required')
        const { data } = await call<{ state?: string, attributes?: Record<string, unknown>, last_changed?: string }>(
          cfg, 'GET', `/api/states/${encodeURIComponent(entityId)}`, null, ctx.signal
        )
        return {
          state: data?.state ?? null,
          attributes: data?.attributes ?? {},
          lastChanged: data?.last_changed ?? null
        }
      }
    },
    {
      id: 'setState',
      name: 'Set entity state',
      description: 'Sets the state of an entity in the state machine (does not control a device — use Call a service for that).',
      needsConnection: true,
      inputSchema: [
        { key: 'entityId', label: 'Entity ID', type: 'string', required: true, placeholder: 'sensor.flow_status' },
        { key: 'state', label: 'State', type: 'string', required: true, placeholder: 'ok' },
        { key: 'attributes', label: 'Attributes', type: 'keyValue', help: 'Optional key/value attributes to attach to the state.' }
      ],
      outputKeys: ['entityId', 'state'],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const entityId = String(ctx.input.entityId ?? '').trim()
        if (!entityId) throw new Error('entityId is required')
        const attributes = (ctx.input.attributes && typeof ctx.input.attributes === 'object') ? ctx.input.attributes as Record<string, unknown> : {}
        const { data } = await call<{ entity_id?: string, state?: string }>(
          cfg, 'POST', `/api/states/${encodeURIComponent(entityId)}`,
          { state: String(ctx.input.state ?? ''), attributes },
          ctx.signal
        )
        ctx.log(`home assistant → set ${entityId} = ${ctx.input.state}`)
        return { entityId: data?.entity_id ?? entityId, state: data?.state ?? null }
      }
    },
    {
      id: 'fireEvent',
      name: 'Fire an event',
      description: 'Fires a custom event on the Home Assistant event bus.',
      needsConnection: true,
      inputSchema: [
        { key: 'eventType', label: 'Event type', type: 'string', required: true, placeholder: 'flow_hub_alert' },
        { key: 'data', label: 'Event data', type: 'keyValue', help: 'Optional key/value payload for the event.' }
      ],
      outputKeys: ['fired', 'eventType'],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const eventType = String(ctx.input.eventType ?? '').trim()
        if (!eventType) throw new Error('eventType is required')
        const payload = (ctx.input.data && typeof ctx.input.data === 'object') ? ctx.input.data as Record<string, unknown> : {}
        await call(cfg, 'POST', `/api/events/${encodeURIComponent(eventType)}`, payload, ctx.signal)
        ctx.log(`home assistant → fired event ${eventType}`)
        return { fired: true, eventType }
      }
    },
    {
      id: 'renderTemplate',
      name: 'Render a template',
      description: 'Renders a Home Assistant Jinja2 template and returns the result (useful as a condition input).',
      needsConnection: true,
      inputSchema: [
        { key: 'template', label: 'Template', type: 'string', required: true, placeholder: '{{ states(\'sensor.outside_temperature\') }}' }
      ],
      outputKeys: ['result'],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const template = String(ctx.input.template ?? '')
        if (!template) throw new Error('template is required')
        // /api/template returns the rendered string as the raw body
        const { data } = await call<string>(cfg, 'POST', '/api/template', { template }, ctx.signal)
        return { result: data }
      }
    }
  ]
}
