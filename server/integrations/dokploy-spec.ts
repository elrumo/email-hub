import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { FieldSchema } from '../engine/types'

/**
 * Parses the bundled Dokploy OpenAPI spec (public/dokploy-api-spec.json) into a
 * flat list of operations, so the integration can auto-generate one flow action
 * per endpoint. The spec is wrapped as result.data.json (a tRPC/openapi dump).
 *
 * Field schemas are derived from query params (GET) or the JSON request body
 * (POST). Complex props (object/array) become JSON-text inputs.
 */

export interface SpecOperation {
  operationId: string
  /** the tRPC-style path, e.g. "application.create" (no leading slash) */
  procedure: string
  method: 'get' | 'post'
  /** resource group, e.g. "application" */
  group: string
  name: string
  description: string
  inputSchema: FieldSchema[]
  /** body keys that should be parsed from JSON text before sending */
  jsonKeys: string[]
}

interface OpenAPISchema {
  type?: string
  anyOf?: Array<{ type?: string }>
  properties?: Record<string, OpenAPISchema>
  required?: string[]
  minLength?: number
  format?: string
}
interface OpenAPIParam { name: string, required?: boolean, schema?: OpenAPISchema }
interface OpenAPIOperation {
  operationId?: string
  parameters?: OpenAPIParam[]
  requestBody?: { content?: { 'application/json'?: { schema?: OpenAPISchema } } }
}
type OpenAPIPaths = Record<string, Partial<Record<'get' | 'post', OpenAPIOperation>>>

let cache: SpecOperation[] | null = null

function humanize(procedure: string): string {
  const [group, ...rest] = procedure.split('.')
  const action = rest.join('.')
  const spaced = action
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .trim()
  const label = spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : group
  return `${cap(group!)}: ${label}`
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** effective type of an OpenAPI schema, resolving anyOf(x|null) → x */
function effectiveType(s: OpenAPISchema | undefined): { type: string, nullable: boolean } {
  if (!s) return { type: 'string', nullable: false }
  if (s.type) return { type: s.type, nullable: false }
  if (s.anyOf) {
    const nonNull = s.anyOf.find(x => x.type && x.type !== 'null')
    const nullable = s.anyOf.some(x => x.type === 'null')
    return { type: nonNull?.type ?? 'string', nullable }
  }
  return { type: 'string', nullable: false }
}

function fieldType(openApiType: string): FieldSchema['type'] {
  switch (openApiType) {
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      return 'string' // string, object, array (objects/arrays handled as JSON text)
  }
}

/** Candidate locations for the spec: dev source tree vs the prod Nitro output. */
function specCandidates(): string[] {
  const cwd = process.cwd()
  return [
    process.env.NUXT_DOKPLOY_SPEC,
    path.resolve(cwd, 'public/dokploy-api-spec.json'), // dev
    path.resolve(cwd, '.output/public/dokploy-api-spec.json'), // prod (build dir as cwd)
    path.resolve(cwd, 'public/dokploy-api-spec.json'.replace('public/', '')) // fallback
  ].filter(Boolean) as string[]
}

function readSpec(): string | null {
  for (const p of specCandidates()) {
    try {
      return readFileSync(p, 'utf8')
    } catch { /* try next */ }
  }
  return null
}

export function loadDokploySpec(): SpecOperation[] {
  if (cache) return cache

  let paths: OpenAPIPaths
  try {
    const raw = readSpec()
    if (!raw) throw new Error(`spec not found in: ${specCandidates().join(', ')}`)
    const parsed = JSON.parse(raw)
    paths = parsed?.result?.data?.json?.paths ?? parsed?.paths ?? {}
  } catch (e) {
    console.error('[dokploy-spec] could not load spec:', e instanceof Error ? e.message : e)
    cache = []
    return cache
  }

  const ops: SpecOperation[] = []
  for (const [rawPath, node] of Object.entries(paths)) {
    const method: 'get' | 'post' = node.post ? 'post' : 'get'
    const op = node[method]
    if (!op) continue
    const procedure = rawPath.replace(/^\//, '')
    const group = procedure.split('.')[0] ?? 'dokploy'

    const inputSchema: FieldSchema[] = []
    const jsonKeys: string[] = []

    if (method === 'get') {
      for (const p of op.parameters ?? []) {
        const { type } = effectiveType(p.schema)
        inputSchema.push({
          key: p.name,
          label: cap(p.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')),
          type: fieldType(type),
          required: !!p.required
        })
      }
    } else {
      const body = op.requestBody?.content?.['application/json']?.schema
      const required = new Set(body?.required ?? [])
      for (const [key, propSchema] of Object.entries(body?.properties ?? {})) {
        const { type } = effectiveType(propSchema)
        const isComplex = type === 'object' || type === 'array'
        if (isComplex) jsonKeys.push(key)
        inputSchema.push({
          key,
          label: cap(key.replace(/([a-z0-9])([A-Z])/g, '$1 $2')),
          type: isComplex ? 'string' : fieldType(type),
          required: required.has(key),
          help: isComplex ? `JSON ${type}` : undefined
        })
      }
    }

    ops.push({
      operationId: op.operationId ?? procedure,
      procedure,
      method,
      group,
      name: humanize(procedure),
      description: `${method.toUpperCase()} /api/${procedure}`,
      inputSchema,
      jsonKeys
    })
  }

  cache = ops.sort((a, b) => a.procedure.localeCompare(b.procedure))
  return cache
}
