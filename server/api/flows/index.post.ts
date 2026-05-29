import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { flows } from '../../db/schema'
import { validateFlowDefinition } from '../../engine/validateFlow'
import { registerAllIntegrations } from '../../integrations'
import { logActivity, requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
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
    ownerId: user.id,
    name,
    description: body?.description ? String(body.description) : null,
    enabled: body?.enabled !== false,
    publicTrigger: !!body?.publicTrigger,
    definition: body.definition,
    cron: validation.cron,
    runAt: validation.runAt,
    timezone: validation.timezone,
    createdAt: now,
    updatedAt: now
  })

  await logActivity(user.id, 'flow.create', { entityType: 'flow', entityId: id, detail: { name } })
  setResponseStatus(event, 201)
  return { id, name }
})
