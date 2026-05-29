import { eq } from 'drizzle-orm'
import type { DB } from '../db'
import { connections } from '../db/schema'
import type { ResolvedConnection } from './types'

export async function resolveConnection(
  db: DB,
  connectionId: string | null | undefined
): Promise<ResolvedConnection | null> {
  if (!connectionId) return null
  const rows = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
  const row = rows[0]
  if (!row) throw new Error(`connection not found: ${connectionId}`)
  return {
    id: row.id,
    integrationId: row.integrationId,
    name: row.name,
    config: row.config
  }
}
