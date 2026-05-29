import { getDb } from '../../db'
import { connectors } from '../../db/schema'

/**
 * List installed user connectors (metadata only — the full def is available on
 * the detail/edit endpoint). Built-in integrations are not listed here; they
 * come from /api/integrations.
 */
export default defineEventHandler(async () => {
  const db = getDb()
  const rows = await db.select().from(connectors)
  return rows.map((r) => {
    const def = r.def as { meta?: { author?: string, version?: string }, actions?: unknown[] }
    return {
      id: r.id,
      connectorId: r.connectorId,
      name: r.name,
      enabled: r.enabled,
      source: r.source,
      author: def?.meta?.author,
      version: def?.meta?.version,
      actionCount: Array.isArray(def?.actions) ? def.actions.length : 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }
  })
})
