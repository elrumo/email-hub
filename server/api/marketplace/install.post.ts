import { randomUUID } from 'node:crypto'
import { applyConnector } from '../../connectors/registry'
import { userIntegrationId } from '../../connectors/compile'
import { fetchRemoteJson } from '../../connectors/fetchRemote'
import { validateConnectorDef } from '../../connectors/validate'
import { getDb } from '../../db'
import { connectors } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { loadMarketplace } from '../../marketplace/catalog'

/**
 * One-click install of a marketplace CONNECTOR by its catalog slug. Resolves the
 * entry's def (inline or fetched from its url), then runs the same
 * validate→persist→register path as POST /api/connectors. Flow entries are not
 * installed here — they go through the flow import flow (slots need binding).
 *
 * Body: { slug: string }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const slug = String(body?.slug ?? '')

  const { connectors: entries } = loadMarketplace()
  const entry = entries.find(e => e.slug === slug)
  if (!entry) throw createError({ statusCode: 404, statusMessage: `marketplace connector not found: ${slug}` })

  const rawDef = entry.def ?? (entry.url ? await fetchRemoteJson(entry.url) : null)
  if (!rawDef) throw createError({ statusCode: 422, statusMessage: 'catalog entry has no def or url' })

  const result = validateConnectorDef(rawDef)
  if (!result.ok || !result.value) {
    throw createError({ statusCode: 422, statusMessage: `catalog connector is invalid: ${result.error}` })
  }
  const def = result.value

  if (getIntegration(userIntegrationId(def.id))) {
    throw createError({ statusCode: 409, statusMessage: `"${def.name}" is already installed` })
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
      source: `marketplace:${slug}`,
      createdAt: now,
      updatedAt: now
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: `"${def.name}" is already installed` })
  }

  applyConnector(def)
  setResponseStatus(event, 201)
  return { id, connectorId: def.id, name: def.name, integrationId: userIntegrationId(def.id) }
})
