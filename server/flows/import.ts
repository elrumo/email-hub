/**
 * Import side of flow sharing: validate a `FlowBundle`, report what the importer
 * needs (which connectors must be installed, which connection slots to fill),
 * and re-bind the placeholders to the importer's own connections to produce a
 * concrete, installable `FlowDefinition`.
 *
 * Pure functions — no DB, no auth. The endpoints (server/api/flows/import*)
 * supply the registry/connection facts and persist the result.
 */

import type { FlowDefinition } from '../engine/types'
import {
  FLOW_BUNDLE_VERSION,
  PLACEHOLDER_RE,
  rewriteConnectionIds,
  type ConnectionSlot,
  type FlowBundle
} from './bundle'

export interface BundleValidation {
  ok: boolean
  error?: string
  value?: FlowBundle
}

/** Structural validation of an uploaded bundle (does not touch the registry). */
export function validateFlowBundle(input: unknown): BundleValidation {
  if (!input || typeof input !== 'object') return { ok: false, error: 'bundle must be an object' }
  const b = input as FlowBundle

  if (b.bundleVersion !== FLOW_BUNDLE_VERSION) {
    return { ok: false, error: `unsupported bundleVersion (expected ${FLOW_BUNDLE_VERSION})` }
  }
  if (!b.name || typeof b.name !== 'string') return { ok: false, error: 'bundle name is required' }
  if (!b.definition || typeof b.definition !== 'object' || !b.definition.trigger) {
    return { ok: false, error: 'bundle is missing a flow definition' }
  }
  if (!Array.isArray(b.connectors)) return { ok: false, error: 'bundle.connectors must be an array' }
  if (!Array.isArray(b.requires)) return { ok: false, error: 'bundle.requires must be an array' }

  const seen = new Set<string>()
  for (const slot of b.requires) {
    if (!slot || typeof slot !== 'object') return { ok: false, error: 'a connection slot is malformed' }
    if (!PLACEHOLDER_RE.test(slot.placeholder)) {
      return { ok: false, error: `invalid slot placeholder: ${String(slot.placeholder)}` }
    }
    if (seen.has(slot.placeholder)) return { ok: false, error: `duplicate slot: ${slot.placeholder}` }
    seen.add(slot.placeholder)
    if (!slot.integrationId || typeof slot.integrationId !== 'string') {
      return { ok: false, error: `slot ${slot.placeholder} is missing integrationId` }
    }
  }

  // every placeholder used in the definition must be declared in requires, and
  // vice-versa — a mismatch means the bundle was hand-edited or corrupted.
  const usedPlaceholders = collectPlaceholders(b.definition)
  for (const p of usedPlaceholders) {
    if (!seen.has(p)) return { ok: false, error: `definition uses an undeclared slot: ${p}` }
  }

  return { ok: true, value: b }
}

/** Gather every "<conn:N>" token actually present in the definition. */
export function collectPlaceholders(def: FlowDefinition): Set<string> {
  const out = new Set<string>()
  const add = (v: string | null | undefined) => {
    if (v && PLACEHOLDER_RE.test(v)) out.add(v)
    return v ?? null
  }
  // rewriteConnectionIds visits every connection slot; we use it read-only by
  // returning the value unchanged on a throwaway clone.
  const clone = structuredClone(def)
  rewriteConnectionIds(clone, add)
  return out
}

export interface InstalledFact {
  /** integration ids currently registered (built-ins + installed connectors) */
  has: (integrationId: string) => boolean
}

export interface InspectResult {
  name: string
  description?: string
  meta?: FlowBundle['meta']
  /** connector dependencies, each marked installed or missing */
  connectors: Array<{ integrationId: string, installed: boolean }>
  /** the slots the importer must bind, with installability noted */
  slots: Array<ConnectionSlot & { connectorInstalled: boolean }>
  /** true when every required connector is installed (import can proceed) */
  ready: boolean
}

/** Report dependencies + slots against what's installed. */
export function inspectBundle(bundle: FlowBundle, installed: InstalledFact): InspectResult {
  const connectors = bundle.connectors
    // "core" pseudo-integration (manual/cron/webhook triggers) is always present
    .filter(id => id !== 'core')
    .map(id => ({ integrationId: id, installed: installed.has(id) }))

  const slots = bundle.requires.map(slot => ({
    ...slot,
    connectorInstalled: installed.has(slot.integrationId)
  }))

  return {
    name: bundle.name,
    description: bundle.description,
    meta: bundle.meta,
    connectors,
    slots,
    ready: connectors.every(c => c.installed)
  }
}

export interface RebindResult {
  ok: boolean
  error?: string
  definition?: FlowDefinition
}

/**
 * Produce a concrete definition by replacing every placeholder with the real
 * connectionId the user chose. `bindings` maps placeholder → connectionId.
 * Every declared slot must be bound (a flow with an unbound connection slot
 * would fail at run time). Returns a fresh definition; does not mutate input.
 */
export function rebindBundle(bundle: FlowBundle, bindings: Record<string, string>): RebindResult {
  for (const slot of bundle.requires) {
    const bound = bindings[slot.placeholder]
    if (!bound || typeof bound !== 'string') {
      return { ok: false, error: `missing connection for "${slot.label}" (${slot.placeholder})` }
    }
  }

  const def = structuredClone(bundle.definition)
  rewriteConnectionIds(def, (current) => {
    if (current && PLACEHOLDER_RE.test(current)) {
      return bindings[current] ?? null
    }
    return current ?? null
  })

  return { ok: true, definition: def }
}
