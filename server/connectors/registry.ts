/**
 * Bridges the `connectors` DB table to the engine registry. Loads every
 * enabled user connector, compiles it, and registers it under its namespaced
 * `x-` id. Called once at boot (after built-ins are registered) and again after
 * any create/update/delete so the catalog reflects changes without a restart.
 *
 * Built-in integrations are NEVER touched here — only ids in the `x-` namespace
 * are added/removed, so the two sets stay disjoint.
 */

import { getDb } from '../db'
import { connectors as connectorsTable } from '../db/schema'
import { listIntegrations, unregisterIntegration, upsertIntegration } from '../engine/registry'
import { compileConnector, isUserIntegrationId, userIntegrationId } from './compile'
import type { ConnectorDef } from './types'
import { validateConnectorDef } from './validate'

/**
 * Reconcile the registry's user-connector set with the DB. Compiles each
 * enabled, valid connector and upserts it; unregisters any `x-` integration no
 * longer backed by an enabled row. Returns the count registered.
 */
export async function syncUserConnectors(): Promise<number> {
  const db = getDb()
  const rows = await db.select().from(connectorsTable)

  const wanted = new Set<string>()
  let registered = 0

  for (const row of rows) {
    if (!row.enabled) continue
    const result = validateConnectorDef(row.def)
    if (!result.ok || !result.value) {
      console.warn(`[connectors] skipping invalid connector "${row.connectorId}": ${result.error}`)
      continue
    }
    const def: ConnectorDef = result.value
    try {
      upsertIntegration(compileConnector(def))
      wanted.add(userIntegrationId(def.id))
      registered++
    } catch (e) {
      console.warn(`[connectors] failed to register "${def.id}": ${e instanceof Error ? e.message : e}`)
    }
  }

  // drop any user integration that's no longer wanted (deleted/disabled)
  for (const integration of listIntegrations()) {
    if (isUserIntegrationId(integration.id) && !wanted.has(integration.id)) {
      unregisterIntegration(integration.id)
    }
  }

  return registered
}

/** Register/replace a single connector immediately (after a create/update). */
export function applyConnector(def: ConnectorDef): void {
  upsertIntegration(compileConnector(def))
}

/** Remove a single connector's integration (after a delete/disable). */
export function removeConnector(connectorId: string): void {
  unregisterIntegration(userIntegrationId(connectorId))
}
