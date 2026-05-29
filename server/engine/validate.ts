import type { FieldSchema } from './types'

export interface ValidationResult {
  ok: boolean
  error?: string
  value: Record<string, unknown>
}

/**
 * Validate + coerce an object against a list of FieldSchemas. Used for
 * connection configs, trigger configs and (lightly) action inputs. Refs
 * ({{ ... }}) bypass type coercion since they resolve at run time.
 */
export function validateAgainstSchema(
  input: unknown,
  schema: FieldSchema[]
): ValidationResult {
  if (input == null || typeof input !== 'object') {
    return { ok: false, error: 'expected an object', value: {} }
  }
  const src = input as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const field of schema) {
    // conditional fields: skip entirely when their showIf predicate isn't met
    if (field.showIf) {
      const controlling = src[field.showIf.field]
      if (!field.showIf.in.some(allowed => allowed === controlling)) continue
    }

    let v = src[field.key]

    if (v === undefined || v === '') {
      if (field.required) {
        return { ok: false, error: `${field.label} is required`, value: {} }
      }
      if (field.default !== undefined) v = field.default
      else continue
    }

    // refs resolve later — store as-is
    if (typeof v === 'string' && /\{\{.*\}\}/.test(v)) {
      out[field.key] = v
      continue
    }

    switch (field.type) {
      case 'number': {
        const n = Number(v)
        if (Number.isNaN(n)) return { ok: false, error: `${field.label} must be a number`, value: {} }
        out[field.key] = n
        break
      }
      case 'boolean':
        out[field.key] = v === true || v === 'true'
        break
      case 'select': {
        const allowed = (field.options ?? []).map(o => String(o.value))
        if (allowed.length && !allowed.includes(String(v))) {
          return { ok: false, error: `${field.label} must be one of: ${allowed.join(', ')}`, value: {} }
        }
        out[field.key] = v
        break
      }
      case 'keyValue': {
        // a flat string→string map (e.g. custom HTTP headers). Coerce loosely:
        // accept an object, drop non-string/blank entries.
        if (v == null || typeof v !== 'object' || Array.isArray(v)) {
          return { ok: false, error: `${field.label} must be a set of key/value pairs`, value: {} }
        }
        const map: Record<string, string> = {}
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          if (k.trim() && val != null && val !== '') map[k] = String(val)
        }
        out[field.key] = map
        break
      }
      default:
        out[field.key] = String(v)
    }
  }

  return { ok: true, value: out }
}

/**
 * Merge a new config over an existing one, preserving existing secret values
 * when the incoming value is the redaction marker (so editing a connection
 * without retyping the secret keeps it).
 */
export function mergeSecrets(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
  schema: FieldSchema[]
): Record<string, unknown> {
  const secretKeys = new Set(schema.filter(f => f.type === 'secret').map(f => f.key))
  const out = { ...incoming }
  for (const k of secretKeys) {
    if (out[k] === '••••••' || out[k] === undefined || out[k] === '') {
      if (existing[k] !== undefined) out[k] = existing[k]
    }
  }
  return out
}
