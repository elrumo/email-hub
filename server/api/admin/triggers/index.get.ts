import { requireAdmin } from '../../../utils/auth'
import { listProjects, listTriggerSettings } from '../../../utils/parse'
import { isMailerConfigured } from '../../../utils/mailer'
import { TRIGGER_DEFS } from '../../../utils/triggers'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)

  const [settings, projects] = await Promise.all([
    listTriggerSettings(),
    listProjects(admin.id)
  ])
  const byKey = new Map(settings.map(s => [s.trigger, s]))

  return {
    mailerConfigured: isMailerConfigured(),
    templates: projects.map(p => ({ id: p.id, name: p.name })),
    triggers: TRIGGER_DEFS.map(def => ({
      ...def,
      projectId: byKey.get(def.key)?.projectId ?? null,
      enabled: byKey.get(def.key)?.enabled ?? false,
      inactiveAfterMonths: byKey.get(def.key)?.inactiveAfterMonths ?? (def.key === 'inactive' ? 3 : null)
    }))
  }
})
