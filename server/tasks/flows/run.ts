import { executeFlow } from '../../engine/service'

/**
 * Run a single flow on demand, wrapped as a Nitro task — usable from runTask()
 * and the dev /_nitro/tasks surface. The HTTP route
 * (server/api/flows/[id]/run.post.ts) remains the primary manual trigger; this
 * exposes the same capability through the task layer.
 *
 * payload: { flowId: string, trigger?: Record<string, unknown> }
 */
export default defineTask({
  meta: {
    name: 'flows:run',
    description: 'Execute a single flow by id'
  },
  async run({ payload }) {
    const flowId = String((payload as { flowId?: unknown })?.flowId ?? '')
    if (!flowId) throw new Error('flows:run requires payload.flowId')
    const trigger = ((payload as { trigger?: Record<string, unknown> })?.trigger) ?? {}
    const result = await executeFlow(flowId, 'manual', trigger)
    return { result }
  }
})
