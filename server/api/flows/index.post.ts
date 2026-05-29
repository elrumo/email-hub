import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { flows } from '../../db/schema'
import { validateFlowDefinition } from '../../engine/validateFlow'
import { registerAllIntegrations } from '../../integrations'

export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const body = await readBody(event)
  const name = String(body?.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const validation = validateFlowDefinition(body?.definition)
  if (!validation.ok) throw createError({ statusCode: 400, statusMessage: validation.error })

  const db = getDb()
  const now = Date.now()
  const id = randomUUID()
  await db.insert(flows).values({
    id,
    name,
    description: body?.description ? String(body.description) : null,
    enabled: body?.enabled !== false,
    definition: body.definition,
    cron: validation.cron,
    createdAt: now,
    updatedAt: now
  })

  setResponseStatus(event, 201)
  return { id, name }
})
