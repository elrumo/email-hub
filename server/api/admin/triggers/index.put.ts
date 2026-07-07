import { requireAdmin } from '../../../utils/auth'
import { getProject, upsertTriggerSetting } from '../../../utils/parse'
import { TRIGGER_DEFS, type TriggerKey } from '../../../utils/triggers'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{
    trigger?: string
    projectId?: string | null
    enabled?: boolean
    inactiveAfterMonths?: number | null
  }>(event)

  const trigger = body.trigger as TriggerKey
  if (!TRIGGER_DEFS.some(d => d.key === trigger)) {
    throw createError({ statusCode: 422, statusMessage: 'Unknown trigger.' })
  }

  const projectId = body.projectId || null
  if (projectId) {
    const project = await getProject(projectId)
    if (!project || project.ownerId !== admin.id) {
      throw createError({ statusCode: 422, statusMessage: 'Pick one of your own email templates.' })
    }
  }

  const months = body.inactiveAfterMonths
  const inactiveAfterMonths = trigger === 'inactive'
    ? Math.min(24, Math.max(1, Math.round(Number(months) || 3)))
    : null

  const setting = await upsertTriggerSetting({
    trigger,
    projectId,
    enabled: !!body.enabled && !!projectId,
    inactiveAfterMonths
  })
  return { setting }
})
