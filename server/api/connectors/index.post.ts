import { randomUUID } from 'node:crypto'
import { applyConnector } from '../../connectors/registry'
import { validateConnectorDef } from '../../connectors/validate'
import { getDb } from '../../db'
import { connectors } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { userIntegrationId } from '../../connectors/compile'

/**
 * Install a user connector from an uploaded `ConnectorDef` JSON. Validates the
 * def, persists it, and registers the compiled integration immediately so it
 * shows up in the catalog without a restart.
 *
 * Body: { def: ConnectorDef, source?: string }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const result = validateConnectorDef(body?.def)
  if (!result.ok || !result.value) {
    throw createError({ statusCode: 400, statusMessage: result.error ?? 'invalid connector' })
  }
  const def = result.value

  // The `x-` namespace keeps user connectors disjoint from built-in ids, so a
  // user `def.id` equal to a built-in id is harmless. Reject only an
  // already-registered `x-<id>` (the DB unique index is the backstop).
  if (getIntegration(userIntegrationId(def.id))) {
    throw createError({ statusCode: 409, statusMessage: `a connector with id "${def.id}" is already installed` })
  }

  const db = getDb()
  const now = Date.now()
  const id = randomUUID()
  try {
    await db.insert(connectors).values({
      id,
      connectorId: def.id,
      name: def.name,
      enabled: true,
      def: def as unknown as Record<string, unknown>,
      source: typeof body?.source === 'string' ? body.source : null,
      createdAt: now,
      updatedAt: now
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: `a connector with id "${def.id}" is already installed` })
  }

  applyConnector(def)

  setResponseStatus(event, 201)
  return { id, connectorId: def.id, name: def.name, integrationId: userIntegrationId(def.id) }
})
