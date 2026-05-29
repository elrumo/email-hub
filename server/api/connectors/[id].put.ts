import { eq } from 'drizzle-orm'
import { applyConnector, removeConnector } from '../../connectors/registry'
import { validateConnectorDef } from '../../connectors/validate'
import { getDb } from '../../db'
import { connectors } from '../../db/schema'

/**
 * Update an installed connector: replace its def and/or toggle `enabled`. The
 * connectorId is immutable (changing it would orphan existing connections that
 * reference the namespaced integration id), so an incoming def must keep the
 * same id. Re-registers (or unregisters, when disabled) immediately.
 *
 * Body: { def?: ConnectorDef, enabled?: boolean }
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody(event)
  const db = getDb()

  const rows = await db.select().from(connectors).where(eq(connectors.id, id))
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'connector not found' })

  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  let nextDef = existing.def

  if (body?.def !== undefined) {
    const result = validateConnectorDef(body.def)
    if (!result.ok || !result.value) {
      throw createError({ statusCode: 400, statusMessage: result.error ?? 'invalid connector' })
    }
    if (result.value.id !== existing.connectorId) {
      throw createError({ statusCode: 400, statusMessage: `connector id is immutable (expected "${existing.connectorId}")` })
    }
    nextDef = result.value as unknown as Record<string, unknown>
    patch.def = nextDef
    patch.name = result.value.name
  }

  const nextEnabled = typeof body?.enabled === 'boolean' ? body.enabled : existing.enabled
  patch.enabled = nextEnabled

  await db.update(connectors).set(patch).where(eq(connectors.id, id))

  // reconcile the registry: register when enabled, drop when disabled
  if (nextEnabled) {
    const result = validateConnectorDef(nextDef)
    if (result.ok && result.value) applyConnector(result.value)
  } else {
    removeConnector(existing.connectorId)
  }

  return { id, connectorId: existing.connectorId, enabled: nextEnabled }
})
