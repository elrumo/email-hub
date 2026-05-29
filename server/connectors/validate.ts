/**
 * Structural validation for an uploaded `ConnectorDef`. This runs on
 * create/update (untrusted input) — it does NOT execute anything. Keep it
 * strict: a malformed connector should be rejected at the door, not blow up
 * inside the runner later.
 */

import type { FieldSchema, FieldType } from '../engine/types'
import { CONNECTOR_SCHEMA_VERSION, type ConnectorDef, type HttpRequestSpec } from './types'

export interface ConnectorValidation {
  ok: boolean
  error?: string
  value?: ConnectorDef
}

const FIELD_TYPES = new Set<FieldType>(['string', 'number', 'boolean', 'secret', 'select', 'keyValue'])
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const BODY_TYPES = new Set(['none', 'json', 'form', 'text'])
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i

function fail(error: string): ConnectorValidation {
  return { ok: false, error }
}

function validateFieldSchema(fields: unknown, where: string): string | null {
  if (!Array.isArray(fields)) return `${where} must be an array`
  const seen = new Set<string>()
  for (const f of fields as FieldSchema[]) {
    if (!f || typeof f !== 'object') return `${where} has a non-object field`
    if (!f.key || typeof f.key !== 'string') return `${where} field is missing a key`
    if (seen.has(f.key)) return `${where} has a duplicate field key: ${f.key}`
    seen.add(f.key)
    if (typeof f.label !== 'string') return `${where} field "${f.key}" needs a label`
    if (!FIELD_TYPES.has(f.type)) return `${where} field "${f.key}" has an invalid type: ${String(f.type)}`
    if (f.type === 'select' && f.options && !Array.isArray(f.options)) {
      return `${where} field "${f.key}" options must be an array`
    }
  }
  return null
}

function validateRequest(req: unknown, where: string): string | null {
  if (!req || typeof req !== 'object') return `${where} request is required`
  const r = req as HttpRequestSpec
  if (!METHODS.has(r.method)) return `${where} has an invalid method: ${String(r.method)}`
  if (typeof r.url !== 'string' || !r.url) return `${where} request needs a url`
  // The url must resolve to an http(s) URL. A url that STARTS with a ref
  // (e.g. "{{connection.webhookUrl}}") is allowed — the scheme comes from the
  // resolved secret, and the SSRF guard re-validates the final URL at run time.
  // A url with a literal prefix must carry an http(s) scheme so it can never
  // become a relative/file URL.
  if (!r.url.startsWith('{{') && !/^https?:\/\//i.test(r.url)) {
    return `${where} url must start with http:// or https:// (or a {{ ref }})`
  }
  if (r.bodyType && !BODY_TYPES.has(r.bodyType)) return `${where} has an invalid bodyType: ${r.bodyType}`
  if (r.headers && (typeof r.headers !== 'object' || Array.isArray(r.headers))) {
    return `${where} headers must be an object`
  }
  if (r.query && (typeof r.query !== 'object' || Array.isArray(r.query))) {
    return `${where} query must be an object`
  }
  return null
}

export function validateConnectorDef(input: unknown): ConnectorValidation {
  if (!input || typeof input !== 'object') return fail('connector must be an object')
  const def = input as ConnectorDef

  if (def.schemaVersion !== CONNECTOR_SCHEMA_VERSION) {
    return fail(`unsupported schemaVersion (expected ${CONNECTOR_SCHEMA_VERSION})`)
  }
  if (!def.id || typeof def.id !== 'string' || !ID_RE.test(def.id)) {
    return fail('id must be alphanumeric (with - or _), 1–64 chars')
  }
  if (!def.name || typeof def.name !== 'string') return fail('name is required')

  const connErr = validateFieldSchema(def.connectionSchema ?? [], 'connectionSchema')
  if (connErr) return fail(connErr)

  if (!Array.isArray(def.actions) || def.actions.length === 0) {
    return fail('connector must have at least one action')
  }
  const actionIds = new Set<string>()
  for (const a of def.actions) {
    if (!a || typeof a !== 'object') return fail('an action is not an object')
    if (!a.id || !ID_RE.test(a.id)) return fail(`action id invalid: ${String(a?.id)}`)
    if (actionIds.has(a.id)) return fail(`duplicate action id: ${a.id}`)
    actionIds.add(a.id)
    if (typeof a.name !== 'string' || !a.name) return fail(`action "${a.id}" needs a name`)
    const inErr = validateFieldSchema(a.inputSchema ?? [], `action "${a.id}" inputSchema`)
    if (inErr) return fail(inErr)
    const reqErr = validateRequest(a.request, `action "${a.id}"`)
    if (reqErr) return fail(reqErr)
    if (a.output && (typeof a.output !== 'object' || Array.isArray(a.output))) {
      return fail(`action "${a.id}" output must be an object`)
    }
  }

  if (def.test) {
    const testErr = validateRequest(def.test.request, 'test')
    if (testErr) return fail(testErr)
  }

  // normalise: keep only the known fields (drop anything extra a malicious
  // upload might carry).
  const clean: ConnectorDef = {
    schemaVersion: CONNECTOR_SCHEMA_VERSION,
    id: def.id,
    name: def.name,
    meta: def.meta,
    icon: typeof def.icon === 'string' ? def.icon : undefined,
    img: typeof def.img === 'string' ? def.img : undefined,
    connectionSchema: def.connectionSchema ?? [],
    actions: def.actions.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      needsConnection: a.needsConnection ?? (def.connectionSchema?.length ? true : false),
      inputSchema: a.inputSchema ?? [],
      outputKeys: a.outputKeys,
      request: a.request,
      output: a.output
    })),
    test: def.test
  }
  return { ok: true, value: clean }
}
