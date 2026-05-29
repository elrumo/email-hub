import type { FieldSchema, Integration } from './types'

/**
 * Helpers shared by the /api/monitors endpoints. A "monitor" is a saved
 * connection (of an integration that declares `monitoring`) plus a per-target
 * config. These helpers keep secret handling and snapshot dispatch in one place.
 */

/** Replace secret-typed values in a target config with the redaction marker for API responses. */
export function redactTargetConfig(
  config: Record<string, unknown>,
  schema: FieldSchema[]
): Record<string, unknown> {
  const secretKeys = new Set(schema.filter(f => f.type === 'secret').map(f => f.key))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(config)) {
    out[k] = secretKeys.has(k) && v ? '••••••' : v
  }
  return out
}

/** The target schema for an integration that supports monitoring (or []). */
export function targetSchemaFor(integration: Integration | undefined): FieldSchema[] {
  return integration?.monitoring?.targetSchema ?? []
}
