import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { flows } from '../../db/schema'
import { validateFlowDefinition } from '../../engine/validateFlow'
import { registerAllIntegrations } from '../../integrations'

export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const db = getDb()
  const rows = await db.select().from(flows).where(eq(flows.id, id))
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'flow not found' })

  const update: Record<string, unknown> = { updatedAt: Date.now() }

  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
    update.name = name
  }
  if (body?.description !== undefined) update.description = body.description ? String(body.description) : null
  if (body?.enabled !== undefined) update.enabled = !!body.enabled
  if (body?.definition !== undefined) {
    const validation = validateFlowDefinition(body.definition)
    if (!validation.ok) throw createError({ statusCode: 400, statusMessage: validation.error })
    update.definition = body.definition
    update.cron = validation.cron
  }

  await db.update(flows).set(update).where(eq(flows.id, id))
  return { id, updated: true }
})
