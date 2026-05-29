/**
 * The generic HTTP-recipe interpreter. Given an `HttpRequestSpec` and a scope
 * of `{ connection, input }`, it interpolates the templated fields, performs
 * the fetch (after the SSRF check), and maps the response via `OutputMapping`.
 *
 * This is the single `run` shared by every action of every declarative
 * connector — the analogue of `callProcedure` in `server/integrations/dokploy.ts`,
 * but fully data-driven (URL, method, headers, body, output all come from the
 * recipe rather than being hard-coded).
 */

import type { HttpRequestSpec, OutputMapping } from './types'
import { assertSafeUrl } from './ssrf'

/** The scope a recipe's `{{ refs }}` resolve against. */
export interface RecipeScope {
  connection: Record<string, unknown>
  input: Record<string, unknown>
}

const FULL_REF = /^\{\{\s*([^}]+?)\s*\}\}$/
const EMBEDDED_REF = /\{\{\s*([^}]+?)\s*\}\}/g

function lookup(path: string, scope: RecipeScope): unknown {
  const parts = path.split('.').map(p => p.trim())
  let cur: unknown = scope
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/**
 * Resolve a recipe value. A string that is EXACTLY one ref keeps the resolved
 * value's type (so a numeric input stays a number in a JSON body); a string
 * with embedded refs interpolates to a string. Objects/arrays recurse.
 */
export function resolveRecipeValue(value: unknown, scope: RecipeScope): unknown {
  if (typeof value === 'string') {
    const full = value.match(FULL_REF)
    if (full) return lookup(full[1] ?? '', scope)
    return value.replace(EMBEDDED_REF, (_, p: string | undefined) => {
      const v = lookup(p ?? '', scope)
      return v == null ? '' : String(v)
    })
  }
  if (Array.isArray(value)) return value.map(v => resolveRecipeValue(v, scope))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = resolveRecipeValue(v, scope)
    return out
  }
  return value
}

/** Resolve a string to a string (for URL/header/query slots). */
function resolveString(value: string, scope: RecipeScope): string {
  const r = resolveRecipeValue(value, scope)
  return r == null ? '' : String(r)
}

/** JSONPath-lite dot read: "a.b[0].c" against a parsed body. */
function readPath(body: unknown, path: string): unknown {
  // normalise [n] to .n then split
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let cur: unknown = body
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

interface HttpResult {
  status: number
  ok: boolean
  body: unknown
  rawText: string
}

/** Map an HTTP result into an output object per the mapping (or a default). */
export function mapOutput(result: HttpResult, mapping?: OutputMapping): Record<string, unknown> {
  if (!mapping || Object.keys(mapping).length === 0) {
    return { status: result.status, ok: result.ok, body: result.body }
  }
  const out: Record<string, unknown> = {}
  for (const [key, expr] of Object.entries(mapping)) {
    if (expr === '$status') out[key] = result.status
    else if (expr === '$ok') out[key] = result.ok
    else if (expr === '$body') out[key] = result.body
    else if (expr.startsWith('=')) {
      const lit = expr.slice(1)
      try {
        out[key] = JSON.parse(lit)
      } catch {
        out[key] = lit
      }
    } else if (expr.startsWith('$.')) {
      out[key] = readPath(result.body, expr.slice(2))
    } else {
      // bare path treated as a body read for convenience
      out[key] = readPath(result.body, expr)
    }
  }
  return out
}

/** Build a fetch RequestInit + final URL from a spec and scope. */
function buildRequest(spec: HttpRequestSpec, scope: RecipeScope): { url: string, init: RequestInit } {
  const url = new URL(resolveString(spec.url, scope))

  for (const [k, v] of Object.entries(spec.query ?? {})) {
    const resolved = resolveString(v, scope)
    if (resolved !== '') url.searchParams.set(k, resolved)
  }

  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(spec.headers ?? {})) {
    headers[k] = resolveString(v, scope)
  }

  const init: RequestInit = { method: spec.method, headers }
  const bodyType = spec.bodyType ?? (spec.body ? 'json' : 'none')

  if (bodyType !== 'none' && spec.method !== 'GET') {
    if (bodyType === 'json') {
      const resolved = resolveRecipeValue(spec.body ?? {}, scope)
      init.body = JSON.stringify(resolved)
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json'
    } else if (bodyType === 'form') {
      const resolved = resolveRecipeValue(spec.body ?? {}, scope) as Record<string, unknown>
      const form = new URLSearchParams()
      for (const [k, v] of Object.entries(resolved)) {
        if (v !== undefined && v !== null && v !== '') form.set(k, String(v))
      }
      init.body = form.toString()
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded'
    } else if (bodyType === 'text') {
      init.body = resolveString(typeof spec.body === 'string' ? spec.body : '', scope)
    }
  }

  return { url: url.toString(), init }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some(h => h.toLowerCase() === name.toLowerCase())
}

/**
 * Execute one recipe request. Throws on transport error; a non-2xx status is
 * NOT thrown (the recipe maps it via $status/$ok) — but if the recipe declares
 * no mapping, the caller can treat `ok:false` as a failure. Used by both the
 * compiled action `run` and the connector test.
 */
export async function executeRecipe(
  spec: HttpRequestSpec,
  scope: RecipeScope,
  signal: AbortSignal,
  log?: (m: string) => void
): Promise<HttpResult> {
  const { url, init } = buildRequest(spec, scope)

  const safe = await assertSafeUrl(url)
  if (!safe.ok) throw new Error(`request blocked: ${safe.reason}`)

  init.signal = signal
  const res = await fetch(url, init)
  const rawText = await res.text().catch(() => '')
  let body: unknown = rawText
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('json') || (rawText.startsWith('{') || rawText.startsWith('['))) {
    try {
      body = JSON.parse(rawText)
    } catch { /* keep rawText */ }
  }
  log?.(`${spec.method} ${new URL(url).host} → ${res.status}`)
  return { status: res.status, ok: res.ok, body, rawText }
}
