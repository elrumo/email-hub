/**
 * Flow sharing — export/import format ("flow bundle") and the shared machinery
 * for moving a `FlowDefinition` between users/instances.
 *
 * A flow can't be shared verbatim: its `connectionId`s point at rows in the
 * author's DB (meaningless to anyone else), and the integrations it uses may not
 * be installed on the importer's instance. A `FlowBundle` solves both:
 *
 *  1. Every real `connectionId` (on the trigger and on every action step, at any
 *     nesting depth) is replaced by a stable placeholder token "<conn:N>", and
 *     the distinct slots are listed under `requires` with their integrationId.
 *     On import the user maps each slot to one of THEIR connections (exactly the
 *     `FlowTemplate.requires` + `build()` re-bind pattern in
 *     server/engine/templates.ts, generalized to arbitrary flows).
 *  2. The set of integration ids the flow depends on is recorded under
 *     `connectors` so the importer can be told which (user) connectors must be
 *     installed first — this is why connector sharing had to come first.
 *
 * A bundle carries NO secrets, NO ownerId, NO connection configs — only the
 * structure. It is pure JSON, suitable for download, a gist, or a marketplace.
 */

import type { ActionStep, FlowDefinition, FlowStep, ForEachStep } from '../engine/types'

/** Bump if the bundle shape changes incompatibly. */
export const FLOW_BUNDLE_VERSION = 1

/** One connection the importer must supply, identified by a placeholder token. */
export interface ConnectionSlot {
  /** the "<conn:N>" token used in the de-referenced definition */
  placeholder: string
  /** which integration a connection for this slot must belong to */
  integrationId: string
  /** human label for the import UI, derived from where the slot was first seen */
  label: string
}

export interface FlowBundle {
  bundleVersion: number
  name: string
  description?: string
  /** optional provenance for a marketplace; informational only */
  meta?: { author?: string, version?: string, homepage?: string }
  /**
   * Integration ids this flow references (built-in like "bunny", or user
   * connectors like "x-foo"). The importer must have each installed. Derived,
   * but stored so `inspect` need not re-walk to report dependencies.
   */
  connectors: string[]
  /** connection slots the importer fills in (placeholder → their connection) */
  requires: ConnectionSlot[]
  /** the flow definition with every connectionId replaced by a placeholder */
  definition: FlowDefinition
}

/** A placeholder token matcher, e.g. "<conn:0>". */
export const PLACEHOLDER_RE = /^<conn:\d+>$/

function placeholderFor(n: number): string {
  return `<conn:${n}>`
}

/** A connection-bearing node: its integrationId and current connectionId. */
interface ConnNode { integrationId: string, connectionId: string | null | undefined }

/**
 * Read every connection-bearing node (trigger + each action step, recursing
 * into forEach) without mutating. Used to collect dependencies and slots.
 */
function readConnectionNodes(def: FlowDefinition): ConnNode[] {
  const out: ConnNode[] = []
  if (def.trigger) out.push({ integrationId: def.trigger.integrationId, connectionId: def.trigger.connectionId })
  const walkSteps = (steps: FlowStep[]): void => {
    for (const step of steps) {
      if (step.type === 'action') {
        const a = step as ActionStep
        out.push({ integrationId: a.integrationId, connectionId: a.connectionId })
      } else if (step.type === 'forEach') {
        walkSteps((step as ForEachStep).steps ?? [])
      }
    }
  }
  walkSteps(def.steps ?? [])
  return out
}

/**
 * Build a shareable bundle from a concrete flow. Replaces each DISTINCT real
 * connectionId with a placeholder (a flow that reuses one connection across
 * several steps yields ONE slot), and records the integration dependencies.
 *
 * Mutates a deep copy, not the input. Steps/triggers with no connectionId
 * (e.g. the connectionless `probe` action, or a `core.manual` trigger) are left
 * untouched and contribute only to `connectors`.
 */
export function exportFlowBundle(
  flow: { name: string, description?: string | null, definition: FlowDefinition },
  meta?: FlowBundle['meta']
): FlowBundle {
  const def: FlowDefinition = structuredClone(flow.definition)

  // Pass 1 (read-only): collect integration dependencies and one slot per
  // distinct real connectionId.
  const slotByConnId = new Map<string, ConnectionSlot>()
  const connectors = new Set<string>()
  for (const node of readConnectionNodes(def)) {
    if (node.integrationId) connectors.add(node.integrationId)
    const real = node.connectionId
    if (!real || slotByConnId.has(real)) continue
    const n = slotByConnId.size
    slotByConnId.set(real, {
      placeholder: placeholderFor(n),
      integrationId: node.integrationId,
      label: `${node.integrationId} connection${n > 0 ? ` #${n + 1}` : ''}`
    })
  }

  // Pass 2 (write): replace each real connectionId with its placeholder.
  rewriteConnectionIds(def, real => (real ? slotByConnId.get(real)?.placeholder ?? real : null))

  return {
    bundleVersion: FLOW_BUNDLE_VERSION,
    name: flow.name,
    description: flow.description ?? undefined,
    meta,
    connectors: [...connectors].sort(),
    requires: [...slotByConnId.values()],
    definition: def
  }
}

/**
 * Rewrite every connectionId in-place via `map`. Shared by export (real→token)
 * and import (token→real). Recurses into forEach.
 *
 * Connectionless nodes (e.g. the `probe` action, a `core.manual` trigger) carry
 * NO `connectionId` key; `apply` preserves that — it never introduces a
 * `connectionId: null` on a node that didn't have one, so a round-trip leaves
 * the definition byte-identical apart from the (re)bound ids.
 */
export function rewriteConnectionIds(
  def: FlowDefinition,
  map: (current: string | null | undefined) => string | null
): void {
  const apply = (holder: { connectionId?: string | null }): void => {
    const had = holder.connectionId != null
    const next = map(holder.connectionId)
    if (next == null && !had) return // was absent, stays absent
    holder.connectionId = next
  }

  if (def.trigger) apply(def.trigger)
  const walkSteps = (steps: FlowStep[]): void => {
    for (const step of steps) {
      if (step.type === 'action') apply(step as ActionStep)
      else if (step.type === 'forEach') walkSteps((step as ForEachStep).steps ?? [])
    }
  }
  walkSteps(def.steps ?? [])
}
