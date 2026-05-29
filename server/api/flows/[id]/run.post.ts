import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { flows } from '../../../db/schema'
import { executeFlow } from '../../../engine/service'
import { registerAllIntegrations } from '../../../integrations'
import { logActivity, requireUser } from '../../../utils/auth'

/** Manually trigger a flow ("Run now"). Body is exposed as {{ trigger.* }}. */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!

  // ownership check — the engine is session-free, so the gate lives here
  const owned = (await getDb()
    .select({ id: flows.id })
    .from(flows)
    .where(and(eq(flows.id, id), eq(flows.ownerId, user.id))))[0]
  if (!owned) throw createError({ statusCode: 404, statusMessage: 'flow not found' })

  const body = await readBody(event).catch(() => ({}))
  const payload = body && typeof body === 'object' ? body : {}
  const result = await executeFlow(id, 'manual', payload as Record<string, unknown>)
  await logActivity(user.id, 'flow.run', {
    entityType: 'flow',
    entityId: id,
    detail: { trigger: 'manual', status: result.status }
  })
  return result
})
