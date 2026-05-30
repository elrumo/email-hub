import { randomUUID } from 'node:crypto'
import { applyConnector } from '../../connectors/registry'
import { fetchRemoteJson } from '../../connectors/fetchRemote'
import { validateConnectorDef } from '../../connectors/validate'
import { getDb } from '../../db'
import { connectors } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { userIntegrationId } from '../../connectors/compile'

/**
 * Install a user connector, from one of:
 *  - `def`: an inline `ConnectorDef` JSON (paste / file upload / OpenAPI review)
 *  - `url`: a link to a raw `ConnectorDef` JSON (fetched here, SSRF-guarded) —
 *    e.g. a marketplace entry or a gist
 *
 * Validates the def, persists it, and registers the compiled integration
 * immediately so it shows up in the catalog without a restart.
 *
 * Body: { def?: ConnectorDef, url?: string, source?: string }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // resolve the def: inline, or fetched from a url
  let rawDef = body?.def
  let source: string | null = typeof body?.source === 'string' ? body.source : null
  if (!rawDef && typeof body?.url === 'string' && body.url.trim()) {
    rawDef = await fetchRemoteJson(body.url)
    source = source ?? body.url.trim()
  }

  const result = validateConnectorDef(rawDef)
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
      source,
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
