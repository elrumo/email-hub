import { executeFlow } from '../../../engine/service'
import { registerAllIntegrations } from '../../../integrations'

/** Manually trigger a flow ("Run now"). Body is exposed as {{ trigger.* }}. */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))
  const payload = body && typeof body === 'object' ? body : {}
  try {
    return await executeFlow(id, 'manual', payload as Record<string, unknown>)
  } catch (e) {
    throw createError({
      statusCode: 404,
      statusMessage: e instanceof Error ? e.message : 'flow not found'
    })
  }
})
