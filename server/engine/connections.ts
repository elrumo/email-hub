import { and, eq } from 'drizzle-orm'
import type { DB } from '../db'
import { connections } from '../db/schema'
import type { ResolvedConnection } from './types'

/**
 * Load a connection scoped to its owner. `ownerId` is required so the engine
 * (which runs without a session) can only ever resolve connections belonging to
 * the flow's owner — a flow can't reference another user's credentials. A
 * connection that exists but belongs to someone else is treated as not found.
 */
export async function resolveConnection(
  db: DB,
  connectionId: string | null | undefined,
  ownerId: string | null | undefined
): Promise<ResolvedConnection | null> {
  if (!connectionId) return null
  const rows = await db
    .select()
    .from(connections)
    .where(
      ownerId
        ? and(eq(connections.id, connectionId), eq(connections.ownerId, ownerId))
        : eq(connections.id, connectionId)
    )
  const row = rows[0]
  if (!row) throw new Error(`connection not found: ${connectionId}`)
  return {
    id: row.id,
    integrationId: row.integrationId,
    name: row.name,
    config: row.config
  }
}
