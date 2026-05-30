import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { flows } from '../../../db/schema'
import type { FlowDefinition } from '../../../engine/types'
import { exportFlowBundle } from '../../../flows/bundle'
import { requireUser } from '../../../utils/auth'

/**
 * Export one of the user's flows as a shareable `FlowBundle` (pure JSON, no
 * secrets, no connection ids). Suitable to download or hand to a marketplace.
 * The importer re-binds the connection slots to their own connections.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!

  const db = getDb()
  const rows = await db.select().from(flows).where(and(eq(flows.id, id), eq(flows.ownerId, user.id)))
  const flow = rows[0]
  if (!flow) throw createError({ statusCode: 404, statusMessage: 'flow not found' })

  const bundle = exportFlowBundle(
    { name: flow.name, description: flow.description, definition: flow.definition as FlowDefinition },
    { author: user.username }
  )

  // hint browsers to download it as a file when fetched directly
  setHeader(event, 'Content-Disposition', `attachment; filename="${slugify(flow.name)}.flow.json"`)
  return bundle
})

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'flow'
}
