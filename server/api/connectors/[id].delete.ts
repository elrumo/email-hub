import { eq } from 'drizzle-orm'
import { removeConnector } from '../../connectors/registry'
import { getDb } from '../../db'
import { connectors } from '../../db/schema'

/**
 * Uninstall a connector. Unregisters its integration immediately. Existing
 * saved connections that reference it are left in the DB but will fail to
 * resolve their integration — the connections page already tolerates an unknown
 * integrationId (it just can't render the form), and deleting them is the
 * user's call.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const db = getDb()

  const rows = await db.select().from(connectors).where(eq(connectors.id, id))
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'connector not found' })

  await db.delete(connectors).where(eq(connectors.id, id))
  removeConnector(row.connectorId)

  return { ok: true, id }
})
