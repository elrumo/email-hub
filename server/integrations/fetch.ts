import type { ActionContext, FieldSchema, Integration } from '../engine/types'
import { buildRequest, execute } from './ping'

/**
 * Web request (cURL / fetch) — a friendly, first-class HTTP node.
 *
 * It is deliberately a sibling of the lower-level `ping` integration (which is
 * framed around uptime checks). This one is the node a user reaches for when
 * they think "call an API": it adds a **Paste a cURL command** field that is
 * parsed into the URL, method, headers and body, on top of the same explicit
 * fields. Anything typed explicitly wins over the parsed cURL, so you can paste
 * a command and then tweak one header.
 *
 * Execution reuses ping's SSRF-guarded `buildRequest`/`execute`, so the same
 * normalized response shape is returned ({ status, ok, body, json, … }) and a
 * downstream condition step can evaluate it exactly like a ping result.
 */

/**
 * Parse a `curl` command line into the request fields our schema understands.
 * Best-effort and forgiving — it handles the flags people actually paste
 * (`-X/--request`, `-H/--header`, `-d/--data*`, `-u/--user`, `--url`, and a
 * bare URL) and ignores the rest. Returns only the keys it could determine.
 */
export function parseCurl(command: string): Record<string, unknown> {
  const tokens = tokenizeCurl(command)
  const out: Record<string, unknown> = {}
  const headers: Record<string, string> = {}
  let method = ''
  let body = ''

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t === 'curl') continue

    if (t === '-X' || t === '--request') {
      method = (tokens[++i] ?? '').toUpperCase()
    } else if (t === '-H' || t === '--header') {
      const raw = tokens[++i] ?? ''
      const idx = raw.indexOf(':')
      if (idx > 0) headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim()
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-ascii') {
      body += (body ? '&' : '') + (tokens[++i] ?? '')
      if (!method) method = 'POST'
    } else if (t === '--url') {
      out.url = tokens[++i] ?? ''
    } else if (t === '-u' || t === '--user') {
      const creds = tokens[++i] ?? ''
      const ci = creds.indexOf(':')
      out.authType = 'basic'
      out.authUser = ci >= 0 ? creds.slice(0, ci) : creds
      out.authPass = ci >= 0 ? creds.slice(ci + 1) : ''
    } else if (t === '-A' || t === '--user-agent') {
      headers['User-Agent'] = tokens[++i] ?? ''
    } else if (t === '-b' || t === '--cookie') {
      headers.Cookie = tokens[++i] ?? ''
    } else if (t.startsWith('-')) {
      // flag we don't model (e.g. -L, -s, -k, --compressed). Skip; if it expects
      // a value we can't know, but the common ones above are value-less.
      continue
    } else if (!out.url) {
      // first bare (non-flag) token is the URL
      out.url = t
    }
  }

  if (method) out.method = method
  if (Object.keys(headers).length) out.headers = headers
  if (body) out.body = body
  return out
}

/**
 * Split a curl command into argv-style tokens, honouring single/double quotes
 * and backslash line continuations so a multi-line pasted command works.
 */
function tokenizeCurl(input: string): string[] {
  const s = input.replace(/\\\r?\n/g, ' ').trim()
  const tokens: string[] = []
  let cur = ''
  let quote: '"' | '\'' | null = null
  let has = false

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (quote) {
      if (c === quote) quote = null
      else cur += c
    } else if (c === '"' || c === '\'') {
      quote = c
      has = true
    } else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      if (has) {
        tokens.push(cur)
        cur = ''
        has = false
      }
    } else {
      cur += c
      has = true
    }
  }
  if (has) tokens.push(cur)
  return tokens
}

const FETCH_FIELDS: FieldSchema[] = [
  {
    key: 'curl', label: 'Paste a cURL command', type: 'string', advanced: true,
    placeholder: 'curl -X POST https://api.example.com -H "Authorization: Bearer …" -d \'{"a":1}\'',
    help: 'Optional. We read the URL, method, headers and body from it. Anything you set in the fields below overrides the pasted command.'
  },
  // url is not `required` here (unlike ping) so you can paste a cURL command and
  // leave the URL field empty; the runtime still errors if neither supplies one.
  { key: 'url', label: 'URL', type: 'string', placeholder: 'https://api.example.com/users' },
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

export const fetchIntegration: Integration = {
  id: 'fetch',
  name: 'Web request (cURL / fetch)',
  icon: 'i-lucide-globe',
  connectionSchema: [], // no stored credentials — everything is supplied per step
  triggers: [],
  actions: [
    {
      id: 'fetch',
      name: 'Fetch a URL',
      description:
        'Calls an API or web page and returns the response. Paste a cURL command or fill in the fields. Follow it with a condition to check the result, e.g. {{ steps.<id>.status }} eq 200, and read the parsed JSON as {{ steps.<id>.json.… }}.',
      needsConnection: false,
      inputSchema: FETCH_FIELDS,
      outputKeys: ['ok', 'status', 'statusText', 'body', 'json', 'headers', 'durationMs', 'url', 'error'],
      run: async (ctx: ActionContext) => {
        // Parsed cURL is the base; explicit (non-empty) fields override it so a
        // user can paste a command and then tweak one value.
        const curl = String(ctx.input.curl ?? '').trim()
        const parsed = curl ? parseCurl(curl) : {}
        const merged: Record<string, unknown> = { ...parsed }
        for (const [k, v] of Object.entries(ctx.input)) {
          if (k === 'curl') continue
          if (v === '' || v == null) continue
          if (k === 'headers' && parsed.headers) {
            merged.headers = { ...(parsed.headers as Record<string, string>), ...(v as Record<string, string>) }
          } else {
            merged[k] = v
          }
        }

        const req = buildRequest(merged)
        const res = await execute(req, ctx.signal)
        if (res.error) {
          ctx.log(`fetch ${req.method} ${req.url} → ${res.error}`)
          throw new Error(res.error)
        }
        ctx.log(`fetch ${req.method} ${req.url} → ${res.status} (${res.durationMs}ms)`)
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
    }
  ]
}
