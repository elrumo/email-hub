import type { ActionContext, FieldSchema, Integration, TestResult } from '../engine/types'

/**
 * AI — one integration that fronts several providers. The connection's first
 * field is a `provider` select; the remaining fields appear conditionally
 * (showIf) so OpenAI needs only an API key, LM Studio needs only a base URL,
 * "compatible" providers expose custom headers + an auth style under Advanced,
 * etc. Adding a provider = add it to PROVIDERS below (and to the select
 * options) — no new integration, no UI change.
 *
 * Under the hood every provider speaks one of two HTTP dialects:
 *   - "openai":    POST {base}/chat/completions, {base}/embeddings
 *   - "anthropic": POST {base}/v1/messages
 * The "compatible" variants are just one of these dialects pointed at a custom
 * base URL with user-supplied auth.
 */

type Dialect = 'openai' | 'anthropic'
type AuthStyle = 'bearer' | 'x-api-key' | 'custom' | 'none'

interface ProviderDef {
  dialect: Dialect
  defaultBaseUrl?: string
  /** default auth style for this provider when the user doesn't override it */
  authStyle: AuthStyle
  /** whether a base URL field should be shown/required for this provider */
  needsBaseUrl: boolean
  /** whether an API key is expected (LM Studio / local often need none) */
  needsKey: boolean
}

const PROVIDERS: Record<string, ProviderDef> = {
  'openai': { dialect: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', authStyle: 'bearer', needsBaseUrl: false, needsKey: true },
  'anthropic': { dialect: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com', authStyle: 'x-api-key', needsBaseUrl: false, needsKey: true },
  'litellm': { dialect: 'openai', authStyle: 'bearer', needsBaseUrl: true, needsKey: true },
  'openai-compatible': { dialect: 'openai', authStyle: 'bearer', needsBaseUrl: true, needsKey: false },
  'anthropic-compatible': { dialect: 'anthropic', authStyle: 'x-api-key', needsBaseUrl: true, needsKey: false },
  'lmstudio': { dialect: 'openai', defaultBaseUrl: 'http://localhost:1234/v1', authStyle: 'none', needsBaseUrl: true, needsKey: false }
}

const PROVIDER_OPTIONS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'LiteLLM (proxy)', value: 'litellm' },
  { label: 'OpenAI-compatible', value: 'openai-compatible' },
  { label: 'Anthropic-compatible', value: 'anthropic-compatible' },
  { label: 'LM Studio (local)', value: 'lmstudio' }
]

const ANTHROPIC_VERSION = '2023-06-01'

function providerOf(config: Record<string, unknown>): { id: string, def: ProviderDef } {
  const id = String(config.provider ?? 'openai')
  return { id, def: PROVIDERS[id] ?? PROVIDERS.openai! }
}

function baseUrl(config: Record<string, unknown>): string {
  const { def } = providerOf(config)
  const explicit = String(config.baseUrl ?? '').trim().replace(/\/$/, '')
  return explicit || def.defaultBaseUrl || ''
}

/** Build request headers from the provider default + any custom headers/auth. */
function buildHeaders(config: Record<string, unknown>): Record<string, string> {
  const { def } = providerOf(config)
  const apiKey = String(config.apiKey ?? '')
  const style = (String(config.authStyle ?? '') || def.authStyle) as AuthStyle
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (def.dialect === 'anthropic') headers['anthropic-version'] = ANTHROPIC_VERSION

  if (apiKey && style !== 'none') {
    if (style === 'bearer') headers.Authorization = `Bearer ${apiKey}`
    else if (style === 'x-api-key') headers['x-api-key'] = apiKey
    else if (style === 'custom') {
      const name = String(config.authHeaderName ?? '').trim()
      if (name) headers[name] = apiKey
    }
  }
  // user-supplied custom headers win (lets people set odd gateways)
  const custom = (config.headers && typeof config.headers === 'object') ? config.headers as Record<string, string> : {}
  for (const [k, v] of Object.entries(custom)) if (k.trim()) headers[k] = String(v)
  return headers
}

async function postJson<T = unknown>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal
): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch { /* leave null */ }
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } } | null)?.error?.message || text.slice(0, 200) || `HTTP ${res.status}`
    throw new Error(`AI request failed (${res.status}): ${msg}`)
  }
  return data as T
}

// ---- dialect-specific chat ------------------------------------------------

interface ChatArgs {
  system?: string
  user: string
  model: string
  temperature?: number
  maxTokens?: number
  /** force a JSON object back (structured output) */
  json?: boolean
}

async function chat(config: Record<string, unknown>, args: ChatArgs, signal: AbortSignal): Promise<string> {
  const { def } = providerOf(config)
  const headers = buildHeaders(config)
  const base = baseUrl(config)
  const maxTokens = args.maxTokens ?? 1024

  if (def.dialect === 'anthropic') {
    const body: Record<string, unknown> = {
      model: args.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: args.user }],
      ...(args.system ? { system: args.system } : {}),
      ...(args.temperature != null ? { temperature: args.temperature } : {})
    }
    if (args.json) {
      body.system = `${args.system ? args.system + '\n\n' : ''}Respond ONLY with a single valid JSON object, no prose, no code fences.`
    }
    const data = await postJson<{ content?: Array<{ text?: string }> }>(`${base}/v1/messages`, headers, body, signal)
    return (data.content ?? []).map(c => c.text ?? '').join('')
  }

  // openai dialect
  const messages: Array<{ role: string, content: string }> = []
  if (args.system) messages.push({ role: 'system', content: args.system })
  messages.push({ role: 'user', content: args.user })
  const body: Record<string, unknown> = {
    model: args.model,
    messages,
    max_tokens: maxTokens,
    ...(args.temperature != null ? { temperature: args.temperature } : {}),
    ...(args.json ? { response_format: { type: 'json_object' } } : {})
  }
  const data = await postJson<{ choices?: Array<{ message?: { content?: string } }> }>(`${base}/chat/completions`, headers, body, signal)
  return data.choices?.[0]?.message?.content ?? ''
}

async function embed(config: Record<string, unknown>, model: string, input: string, signal: AbortSignal): Promise<number[]> {
  const { def } = providerOf(config)
  if (def.dialect !== 'openai') throw new Error('Embeddings are only supported on OpenAI-style providers')
  const data = await postJson<{ data?: Array<{ embedding?: number[] }> }>(
    `${baseUrl(config)}/embeddings`, buildHeaders(config), { model, input }, signal
  )
  return data.data?.[0]?.embedding ?? []
}

// ---- connection schema (conditional fields) -------------------------------

const openaiStyle = ['openai', 'litellm', 'openai-compatible', 'lmstudio']
const anthropicStyle = ['anthropic', 'anthropic-compatible']
const needsBaseUrlProviders = Object.entries(PROVIDERS).filter(([, d]) => d.needsBaseUrl).map(([id]) => id)
const needsKeyOptional = ['litellm', 'openai-compatible', 'anthropic-compatible', 'lmstudio']

const connectionSchema: FieldSchema[] = [
  { key: 'provider', label: 'Provider', type: 'select', required: true, default: 'openai', options: PROVIDER_OPTIONS },
  {
    key: 'baseUrl', label: 'Base URL', type: 'string',
    placeholder: 'https://your-proxy.example.com/v1',
    help: 'The API base URL. Leave blank to use the provider default.',
    showIf: { field: 'provider', in: needsBaseUrlProviders }
  },
  {
    key: 'apiKey', label: 'API key', type: 'secret', required: true,
    help: 'Your provider API key.',
    showIf: { field: 'provider', in: ['openai', 'anthropic'] }
  },
  {
    key: 'apiKey', label: 'API key (optional)', type: 'secret',
    help: 'Leave blank if your endpoint needs no auth (e.g. local LM Studio).',
    showIf: { field: 'provider', in: needsKeyOptional }
  },
  {
    key: 'defaultModel', label: 'Default model', type: 'string',
    placeholder: 'gpt-4o-mini / claude-3-5-sonnet-latest / llama-3.1-8b',
    help: 'Used when an action doesn\'t specify a model.'
  },
  // --- advanced ---
  {
    key: 'authStyle', label: 'Auth style', type: 'select', advanced: true,
    help: 'How the API key is sent. Defaults to the provider\'s standard.',
    options: [
      { label: 'Provider default', value: '' },
      { label: 'Bearer token (Authorization)', value: 'bearer' },
      { label: 'x-api-key header', value: 'x-api-key' },
      { label: 'Custom header', value: 'custom' },
      { label: 'No auth', value: 'none' }
    ]
  },
  {
    key: 'authHeaderName', label: 'Custom auth header name', type: 'string', advanced: true,
    placeholder: 'X-My-Token',
    showIf: { field: 'authStyle', in: ['custom'] }
  },
  {
    key: 'headers', label: 'Extra headers', type: 'keyValue', advanced: true,
    placeholder: 'Header name',
    help: 'Sent on every request. Useful for gateways (e.g. LiteLLM virtual keys, org ids).'
  }
]

// note: two fields share key "apiKey" with mutually-exclusive showIf so the
// label can differ (required vs optional). Only one is ever visible/validated.

async function testConnection(config: Record<string, unknown>, signal: AbortSignal): Promise<TestResult> {
  const { id, def } = providerOf(config)
  const base = baseUrl(config)
  if (def.needsBaseUrl && !base) return { ok: false, message: 'Base URL is required for this provider' }
  if (def.needsKey && !String(config.apiKey ?? '')) return { ok: false, message: 'API key is required for this provider' }
  try {
    if (def.dialect === 'openai') {
      // GET /models is the cheapest authed read across OpenAI-style providers
      const res = await fetch(`${base}/models`, { headers: stripContentType(buildHeaders(config)), signal })
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'API key rejected' }
      if (!res.ok) return { ok: false, message: `${id} returned ${res.status}` }
      const data = await res.json().catch(() => null) as { data?: unknown[] } | null
      const n = Array.isArray(data?.data) ? data!.data!.length : 0
      return { ok: true, message: n ? `Connected — ${n} model${n === 1 ? '' : 's'} available` : 'Connected' }
    }
    // anthropic: no cheap list endpoint — do a 1-token message
    const reply = await chat(config, { user: 'ping', model: String(config.defaultModel ?? 'claude-3-5-haiku-latest'), maxTokens: 1 }, signal)
    return { ok: true, message: reply != null ? 'Connected to Anthropic' : 'Connected' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not reach the AI provider'
    return { ok: false, message: /401|403|unauthor/i.test(msg) ? 'API key rejected' : msg }
  }
}

function stripContentType(h: Record<string, string>): Record<string, string> {
  const { 'Content-Type': _ct, ...rest } = h
  return rest
}

/** model for an action: explicit input → connection default → error */
function modelFor(ctx: ActionContext): string {
  const m = String(ctx.input.model ?? '') || String(ctx.connection?.config.defaultModel ?? '')
  if (!m) throw new Error('No model specified (set one on the step or a default on the connection)')
  return m
}
function num(v: unknown): number | undefined {
  if (v === undefined || v === '' || v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const modelField: FieldSchema = { key: 'model', label: 'Model', type: 'string', placeholder: 'leave blank to use the connection default' }
const tempField: FieldSchema = { key: 'temperature', label: 'Temperature', type: 'number', placeholder: '0.7' }
const maxTokField: FieldSchema = { key: 'maxTokens', label: 'Max tokens', type: 'number', default: 1024 }

export const aiIntegration: Integration = {
  id: 'ai',
  name: 'AI',
  icon: 'i-lucide-sparkles',
  connectionSchema,
  testConnection,
  triggers: [],
  actions: [
    {
      id: 'generateText',
      name: 'Generate text',
      description: 'Sends a prompt to the model and returns its text reply.',
      needsConnection: true,
      inputSchema: [
        { key: 'system', label: 'System prompt', type: 'string', placeholder: 'You are a terse SRE assistant.' },
        { key: 'prompt', label: 'Prompt', type: 'string', required: true, placeholder: 'Summarise these logs: {{ steps.logs.text }}' },
        modelField, tempField, maxTokField
      ],
      outputKeys: ['text'],
      run: async (ctx) => {
        const text = await chat(ctx.connection!.config, {
          system: String(ctx.input.system ?? '') || undefined,
          user: String(ctx.input.prompt ?? ''),
          model: modelFor(ctx),
          temperature: num(ctx.input.temperature),
          maxTokens: num(ctx.input.maxTokens)
        }, ctx.signal)
        ctx.log(`ai generateText → ${text.length} chars`)
        return { text }
      }
    },
    {
      id: 'generateJson',
      name: 'Generate structured JSON',
      description: 'Forces the model to return a JSON object so later steps can reference its fields.',
      needsConnection: true,
      inputSchema: [
        { key: 'system', label: 'System prompt', type: 'string', placeholder: 'Extract fields as JSON.' },
        { key: 'prompt', label: 'Prompt', type: 'string', required: true, placeholder: 'From this alert, return {severity, service}: {{ steps.x.text }}' },
        modelField, tempField, maxTokField
      ],
      outputKeys: ['result', 'raw'],
      run: async (ctx) => {
        const raw = await chat(ctx.connection!.config, {
          system: String(ctx.input.system ?? '') || undefined,
          user: String(ctx.input.prompt ?? ''),
          model: modelFor(ctx),
          temperature: num(ctx.input.temperature),
          maxTokens: num(ctx.input.maxTokens),
          json: true
        }, ctx.signal)
        let result: unknown = null
        try {
          // tolerate accidental code fences
          result = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim())
        } catch {
          throw new Error('Model did not return valid JSON')
        }
        ctx.log('ai generateJson → parsed object')
        return { result, raw }
      }
    },
    {
      id: 'classify',
      name: 'Classify (pick one label)',
      description: 'Returns exactly one of the labels you provide — handy as a condition gate.',
      needsConnection: true,
      inputSchema: [
        { key: 'text', label: 'Text to classify', type: 'string', required: true, placeholder: '{{ steps.logs.text }}' },
        { key: 'labels', label: 'Labels (comma-separated)', type: 'string', required: true, placeholder: 'incident, noise' },
        { key: 'instructions', label: 'Extra instructions', type: 'string', placeholder: 'Treat timeouts as incidents.' },
        modelField
      ],
      outputKeys: ['label', 'matched'],
      run: async (ctx) => {
        const labels = String(ctx.input.labels ?? '').split(',').map(s => s.trim()).filter(Boolean)
        if (labels.length < 2) throw new Error('Provide at least two labels')
        const system = `You are a classifier. Respond with EXACTLY one of these labels and nothing else: ${labels.join(', ')}.`
          + (ctx.input.instructions ? `\n${ctx.input.instructions}` : '')
        const reply = (await chat(ctx.connection!.config, {
          system,
          user: String(ctx.input.text ?? ''),
          model: modelFor(ctx),
          temperature: 0,
          maxTokens: 16
        }, ctx.signal)).trim()
        // normalise: pick the label whose text appears in the reply
        const label = labels.find(l => reply.toLowerCase() === l.toLowerCase())
          ?? labels.find(l => reply.toLowerCase().includes(l.toLowerCase()))
          ?? reply
        ctx.log(`ai classify → ${label}`)
        return { label, matched: labels.includes(label) }
      }
    },
    {
      id: 'embed',
      name: 'Create an embedding',
      description: 'Turns text into a vector (OpenAI-style providers only).',
      needsConnection: true,
      inputSchema: [
        { key: 'text', label: 'Text', type: 'string', required: true, placeholder: '{{ steps.x.text }}' },
        { key: 'model', label: 'Embedding model', type: 'string', placeholder: 'text-embedding-3-small' }
      ],
      outputKeys: ['embedding', 'dimensions'],
      run: async (ctx) => {
        const model = String(ctx.input.model ?? '') || String(ctx.connection?.config.defaultModel ?? '')
        if (!model) throw new Error('No embedding model specified')
        const embedding = await embed(ctx.connection!.config, model, String(ctx.input.text ?? ''), ctx.signal)
        ctx.log(`ai embed → ${embedding.length} dims`)
        return { embedding, dimensions: embedding.length }
      }
    }
  ]
}
