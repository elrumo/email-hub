/**
 * Convert an OpenAPI 3.x / Swagger 2.0 document into a declarative
 * `ConnectorDef` (see `server/connectors/types.ts`). The output is the SAME
 * inert JSON a user could hand-author and upload — so it flows through the
 * existing validate → install pipeline unchanged; this file just spares the
 * user from writing the recipe by hand.
 *
 * The mapping mirrors `server/integrations/dokploy-spec.ts` (params/body →
 * `FieldSchema`), but generalised:
 *  - URL/base, method, headers, query and body all become a templated
 *    `HttpRequestSpec` instead of being hard-coded.
 *  - `securitySchemes` (3.x) / `securityDefinitions` (2.0) become the
 *    `connectionSchema` (apiKey header/query, http bearer/basic) so the
 *    credential fields are interpolated into every action's request.
 *
 * Nothing here executes a request — that only happens later, SSRF-guarded, in
 * `server/connectors/http.ts`.
 */

import { load as loadYaml } from 'js-yaml'
import type { FieldSchema } from '../engine/types'
import {
  CONNECTOR_SCHEMA_VERSION,
  type ConnectorAction,
  type ConnectorDef,
  type HttpRequestSpec
} from './types'

// ---------------------------------------------------------------------------
// Minimal structural typings for the slice of the spec we read. We deliberately
// avoid a full OpenAPI type dependency — only these fields matter for the
// recipe, and unknown extras are ignored.
// ---------------------------------------------------------------------------

interface JsonSchema {
  type?: string
  format?: string
  enum?: Array<string | number>
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
  anyOf?: JsonSchema[]
  allOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  $ref?: string
}

interface Parameter {
  name: string
  in: 'query' | 'header' | 'path' | 'cookie' | 'body' | 'formData'
  required?: boolean
  description?: string
  schema?: JsonSchema
  type?: string // swagger 2.0 puts the type on the param itself
  enum?: Array<string | number>
  $ref?: string
}

interface RequestBody {
  required?: boolean
  content?: Record<string, { schema?: JsonSchema }>
}

interface Operation {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: Parameter[]
  requestBody?: RequestBody
  consumes?: string[] // swagger 2.0
  deprecated?: boolean
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const
type HttpMethod = (typeof HTTP_METHODS)[number]

interface PathItem extends Partial<Record<HttpMethod, Operation>> {
  parameters?: Parameter[]
}

interface SecurityScheme {
  type?: string // apiKey | http | oauth2 | openIdConnect (2.0: apiKey | basic | oauth2)
  in?: 'query' | 'header' | 'cookie'
  name?: string // header/query param name for apiKey
  scheme?: string // http: "bearer" | "basic"
  description?: string
}

interface OpenApiDoc {
  openapi?: string
  swagger?: string
  info?: { title?: string, version?: string, description?: string }
  servers?: Array<{ url?: string }>
  host?: string // swagger 2.0
  basePath?: string // swagger 2.0
  schemes?: string[] // swagger 2.0
  paths?: Record<string, PathItem>
  components?: { securitySchemes?: Record<string, SecurityScheme> }
  securityDefinitions?: Record<string, SecurityScheme> // swagger 2.0
}

export interface ConvertOptions {
  /** override the generated connector id (else derived from info.title) */
  id?: string
  /** override the generated connector name (else info.title) */
  name?: string
  /**
   * Restrict to operations whose tag OR path matches one of these. A token
   * matches if it equals one of the operation's tags, or the request path
   * starts with it (e.g. "/v2/projects"). Empty/absent = import everything.
   */
  include?: string[]
  /** explicit base URL, overriding whatever the spec declares (e.g. for a relative-server spec). */
  baseUrl?: string
}

export interface ConvertResult {
  ok: boolean
  error?: string
  def?: ConnectorDef
  /** non-fatal notes (skipped ops, fallbacks) surfaced to the import UI */
  warnings?: string[]
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Parse a raw spec string as JSON, falling back to YAML. */
export function parseSpec(raw: string): OpenApiDoc | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as OpenApiDoc
  } catch {
    try {
      const doc = loadYaml(trimmed)
      return doc && typeof doc === 'object' ? (doc as OpenApiDoc) : null
    } catch {
      return null
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ID_SAFE = /[^a-z0-9_-]/gi

function slugifyId(s: string, fallback: string): string {
  const slug = s.toLowerCase().replace(/\s+/g, '-').replace(ID_SAFE, '').slice(0, 64)
  return slug || fallback
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function humanizeKey(key: string): string {
  return cap(key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._-]/g, ' ').trim())
}

/** Resolve a local `#/...` $ref against the root document. Returns null on miss. */
function resolveRef<T>(ref: string, root: OpenApiDoc): T | null {
  if (!ref.startsWith('#/')) return null
  const parts = ref.slice(2).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))
  let cur: unknown = root
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return null
    cur = (cur as Record<string, unknown>)[p]
  }
  return (cur as T) ?? null
}

/** Resolve a schema's top-level $ref (one hop, enough for param/body typing). */
function deref(schema: JsonSchema | undefined, root: OpenApiDoc): JsonSchema | undefined {
  if (schema?.$ref) return resolveRef<JsonSchema>(schema.$ref, root) ?? schema
  return schema
}

/** Map a JSON-schema/OpenAPI type to a flow FieldSchema type. Complex → string (JSON text). */
function fieldType(schema: JsonSchema | undefined): { type: FieldSchema['type'], complex: boolean } {
  const t = schema?.type
    ?? (schema?.anyOf ?? schema?.oneOf)?.find(s => s.type && s.type !== 'null')?.type
  switch (t) {
    case 'integer':
    case 'number':
      return { type: 'number', complex: false }
    case 'boolean':
      return { type: 'boolean', complex: false }
    case 'object':
    case 'array':
      return { type: 'string', complex: true } // edited as JSON text
    default:
      return { type: 'string', complex: false }
  }
}

function paramToField(p: Parameter, root: OpenApiDoc): FieldSchema {
  const schema = deref(p.schema, root)
  // swagger 2.0 puts type/enum on the param itself, not under `schema`
  const effective: JsonSchema = schema ?? { type: p.type, enum: p.enum }
  const { type, complex } = fieldType(effective)
  const field: FieldSchema = {
    key: p.name,
    label: humanizeKey(p.name),
    type,
    required: !!p.required || p.in === 'path'
  }
  if (p.description) field.help = p.description
  if (complex) field.help = `JSON ${effective.type}${field.help ? ` — ${field.help}` : ''}`
  const en = effective.enum ?? p.enum
  if (en?.length && type !== 'boolean') {
    field.type = 'select'
    field.options = en.map(v => ({ label: String(v), value: v }))
  }
  return field
}

/** Pick the JSON request-body schema from an OpenAPI 3.x requestBody. */
function bodySchema(op: Operation, root: OpenApiDoc): { schema?: JsonSchema, required: boolean } {
  const body = op.requestBody
  if (!body?.content) return { required: false }
  const json = body.content['application/json'] ?? body.content[Object.keys(body.content)[0] ?? '']
  return { schema: deref(json?.schema, root), required: !!body.required }
}

// ---------------------------------------------------------------------------
// Security → connectionSchema + per-request auth
// ---------------------------------------------------------------------------

interface AuthPlan {
  connectionSchema: FieldSchema[]
  /** headers to merge into every action's request (templated). */
  headers: Record<string, string>
  /** query params to merge into every action's request (templated). */
  query: Record<string, string>
}

/**
 * Translate the spec's security schemes into connection fields + the templated
 * header/query slots that carry the credential on each request. We support the
 * common cases (apiKey in header/query, http bearer, http basic); unknown
 * schemes (oauth2/openIdConnect) are noted as warnings and the user can add the
 * needed field by editing the def before install.
 */
function buildAuth(doc: OpenApiDoc, warnings: string[]): AuthPlan {
  const schemes = doc.components?.securitySchemes ?? doc.securityDefinitions ?? {}
  const connectionSchema: FieldSchema[] = []
  const headers: Record<string, string> = {}
  const query: Record<string, string> = {}
  const seen = new Set<string>()

  const addField = (f: FieldSchema) => {
    if (seen.has(f.key)) return
    seen.add(f.key)
    connectionSchema.push(f)
  }

  for (const [name, scheme] of Object.entries(schemes)) {
    const type = scheme.type?.toLowerCase()
    if (type === 'apikey') {
      const key = 'apiKey'
      addField({ key, label: 'API Key', type: 'secret', required: true, help: scheme.description })
      if (scheme.in === 'query' && scheme.name) query[scheme.name] = `{{connection.${key}}}`
      else if (scheme.name) headers[scheme.name] = `{{connection.${key}}}` // default to header
    } else if (type === 'http' && scheme.scheme?.toLowerCase() === 'bearer') {
      addField({ key: 'token', label: 'Bearer Token', type: 'secret', required: true, help: scheme.description })
      headers.Authorization = 'Bearer {{connection.token}}'
    } else if ((type === 'http' && scheme.scheme?.toLowerCase() === 'basic') || type === 'basic') {
      addField({ key: 'username', label: 'Username', type: 'string', required: true })
      addField({ key: 'password', label: 'Password', type: 'secret', required: true })
      // Basic auth needs base64(user:pass); the recipe interpreter has no such
      // helper, so we leave a raw Authorization header the user can wire up, and
      // warn. Most modern APIs use bearer/apiKey, so this is a rare path.
      warnings.push(`security scheme "${name}" is HTTP Basic — base64 encoding isn't supported by the recipe interpreter; set the Authorization header manually after import.`)
    } else if (type) {
      warnings.push(`security scheme "${name}" (${type}) isn't auto-mapped — add the credential field and request header by editing the connector before install.`)
    }
  }

  return { connectionSchema, headers, query }
}

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

function resolveBaseUrl(doc: OpenApiDoc, override?: string): string | null {
  if (override) return override.replace(/\/$/, '')
  // OpenAPI 3.x
  const server = doc.servers?.find(s => s.url)?.url
  if (server) {
    if (/^https?:\/\//i.test(server)) return server.replace(/\/$/, '')
    // relative server url — can't form an absolute URL; caller may override
    return null
  }
  // Swagger 2.0
  if (doc.host) {
    const scheme = doc.schemes?.includes('https') ? 'https' : doc.schemes?.[0] ?? 'https'
    const base = `${scheme}://${doc.host}${doc.basePath ?? ''}`
    return base.replace(/\/$/, '')
  }
  return null
}

// ---------------------------------------------------------------------------
// Operation → action
// ---------------------------------------------------------------------------

function matchesInclude(tags: string[] | undefined, path: string, include?: string[]): boolean {
  if (!include?.length) return true
  return include.some(tok => tags?.includes(tok) || path.startsWith(tok))
}

/** Build a stable, unique action id from operationId or method+path. */
function actionId(op: Operation, method: string, path: string, used: Set<string>): string {
  let base = op.operationId
    ? slugifyId(op.operationId, '')
    : slugifyId(`${method}-${path.replace(/[{}]/g, '').replace(/\//g, '-')}`, 'op')
  if (!base) base = 'op'
  let id = base
  let n = 2
  while (used.has(id)) id = `${base}-${n++}`
  used.add(id)
  return id
}

function buildAction(
  op: Operation,
  method: HttpMethod,
  path: string,
  inheritedParams: Parameter[],
  baseUrl: string,
  auth: AuthPlan,
  root: OpenApiDoc,
  usedIds: Set<string>,
  needsConnection: boolean
): ConnectorAction {
  const id = actionId(op, method, path, usedIds)
  const params = [...inheritedParams, ...(op.parameters ?? [])]
    .map(p => (p.$ref ? resolveRef<Parameter>(p.$ref, root) ?? p : p))
    .filter((p): p is Parameter => !!p && !!p.name)

  const inputSchema: FieldSchema[] = []
  const jsonBodyKeys = new Set<string>()
  const query: Record<string, string> = { ...auth.query }
  const headers: Record<string, string> = { ...auth.headers }

  // Path templating: OpenAPI uses {name}; our recipe uses {{input.name}}.
  let urlPath = path
  for (const p of params) {
    if (p.in === 'path') {
      inputSchema.push(paramToField(p, root))
      urlPath = urlPath.replace(new RegExp(`\\{${p.name}\\}`, 'g'), `{{input.${p.name}}}`)
    } else if (p.in === 'query') {
      inputSchema.push(paramToField(p, root))
      query[p.name] = `{{input.${p.name}}}`
    } else if (p.in === 'header') {
      inputSchema.push(paramToField(p, root))
      headers[p.name] = `{{input.${p.name}}}`
    }
    // cookie params are not supported by the recipe interpreter; skipped silently.
  }

  const request: HttpRequestSpec = {
    method: method.toUpperCase() as HttpRequestSpec['method'],
    url: `${baseUrl}${urlPath}`
  }
  if (Object.keys(headers).length) request.headers = headers
  if (Object.keys(query).length) request.query = query

  // Request body (3.x requestBody, or swagger 2.0 body/formData params).
  if (method !== 'get') {
    const { schema } = bodySchema(op, root)
    if (schema?.properties) {
      const required = new Set(schema.required ?? [])
      const body: Record<string, unknown> = {}
      for (const [key, propRaw] of Object.entries(schema.properties)) {
        const prop = deref(propRaw, root)
        const { type, complex } = fieldType(prop)
        const field: FieldSchema = {
          key,
          label: humanizeKey(key),
          type: complex ? 'string' : type,
          required: required.has(key)
        }
        if (complex) {
          field.help = `JSON ${prop?.type}`
          jsonBodyKeys.add(key)
        }
        if (prop?.enum?.length && !complex && type !== 'boolean') {
          field.type = 'select'
          field.options = prop.enum.map(v => ({ label: String(v), value: v }))
        }
        inputSchema.push(field)
        body[key] = `{{input.${key}}}`
      }
      if (Object.keys(body).length) {
        request.bodyType = 'json'
        request.body = body
      }
    } else {
      // swagger 2.0 body/formData params
      const bodyParam = params.find(p => p.in === 'body')
      const formParams = params.filter(p => p.in === 'formData')
      const bs = deref(bodyParam?.schema, root)
      if (bs?.properties) {
        const required = new Set(bs.required ?? [])
        const body: Record<string, unknown> = {}
        for (const [key, propRaw] of Object.entries(bs.properties)) {
          const prop = deref(propRaw, root)
          const { type, complex } = fieldType(prop)
          inputSchema.push({
            key,
            label: humanizeKey(key),
            type: complex ? 'string' : type,
            required: required.has(key),
            help: complex ? `JSON ${prop?.type}` : undefined
          })
          body[key] = `{{input.${key}}}`
        }
        request.bodyType = 'json'
        request.body = body
      } else if (formParams.length) {
        const body: Record<string, unknown> = {}
        for (const p of formParams) {
          inputSchema.push(paramToField(p, root))
          body[p.name] = `{{input.${p.name}}}`
        }
        request.bodyType = 'form'
        request.body = body
      }
    }
  }

  const action: ConnectorAction = {
    id,
    name: op.summary || humanizeKey(op.operationId || `${method} ${path}`),
    description: op.description || `${method.toUpperCase()} ${path}`,
    needsConnection,
    inputSchema,
    request
  }
  return action
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Convert a parsed (or raw-string) spec into a ConnectorDef. */
export function convertOpenApi(input: string | OpenApiDoc, opts: ConvertOptions = {}): ConvertResult {
  const doc = typeof input === 'string' ? parseSpec(input) : input
  if (!doc || typeof doc !== 'object') {
    return { ok: false, error: 'could not parse spec as JSON or YAML' }
  }
  if (!doc.openapi && !doc.swagger) {
    return { ok: false, error: 'not an OpenAPI/Swagger document (missing "openapi"/"swagger" version field)' }
  }
  if (!doc.paths || typeof doc.paths !== 'object') {
    return { ok: false, error: 'spec has no "paths"' }
  }

  const warnings: string[] = []
  const baseUrl = resolveBaseUrl(doc, opts.baseUrl)
  if (!baseUrl) {
    return {
      ok: false,
      error: 'could not determine an absolute base URL from the spec (no servers[].url / host). Provide a baseUrl to import.'
    }
  }

  const title = doc.info?.title ?? 'imported-api'
  const id = opts.id ? slugifyId(opts.id, 'imported-api') : slugifyId(title, 'imported-api')
  const name = opts.name ?? title

  const auth = buildAuth(doc, warnings)
  const needsConnection = auth.connectionSchema.length > 0

  const actions: ConnectorAction[] = []
  const usedIds = new Set<string>()

  for (const [path, itemRaw] of Object.entries(doc.paths)) {
    const item = itemRaw as PathItem
    const inherited = item.parameters ?? []
    for (const method of HTTP_METHODS) {
      const op = item[method]
      if (!op) continue
      if (!matchesInclude(op.tags, path, opts.include)) continue
      try {
        actions.push(
          buildAction(op, method, path, inherited, baseUrl, auth, doc, usedIds, needsConnection)
        )
      } catch (e) {
        warnings.push(`skipped ${method.toUpperCase()} ${path}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  if (actions.length === 0) {
    return {
      ok: false,
      error: opts.include?.length
        ? `no operations matched the include filter (${opts.include.join(', ')})`
        : 'spec produced no operations'
    }
  }

  const def: ConnectorDef = {
    schemaVersion: CONNECTOR_SCHEMA_VERSION,
    id,
    name,
    meta: {
      version: doc.info?.version,
      description: doc.info?.description,
      homepage: baseUrl
    },
    connectionSchema: auth.connectionSchema,
    actions
  }

  return { ok: true, def, warnings: warnings.length ? warnings : undefined }
}
