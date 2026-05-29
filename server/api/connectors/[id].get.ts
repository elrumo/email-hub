import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connectors } from '../../db/schema'

/** Full record (including the editable def) for one installed connector. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const db = getDb()
  const rows = await db.select().from(connectors).where(eq(connectors.id, id))
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'connector not found' })
  return {
    id: row.id,
    connectorId: row.connectorId,
    name: row.name,
    enabled: row.enabled,
    source: row.source,
    def: row.def,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
})
