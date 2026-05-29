import { flowTemplates } from '../engine/templates'
import { registerAllIntegrations } from '../integrations'

/** Starter flow templates the builder can offer ("start from a template"). */
export default defineEventHandler(() => {
  registerAllIntegrations()
  return flowTemplates.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    requires: t.requires
  }))
})
