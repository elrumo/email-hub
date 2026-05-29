import { listIntegrations } from '../engine/registry'
import { registerAllIntegrations } from '../integrations'

/**
 * Returns the integration catalog (with connection schemas, triggers, actions
 * and their field schemas) so the UI can render schema-driven forms. `run`/
 * `poll` functions are stripped — only serializable metadata is sent.
 */
export default defineEventHandler(() => {
  registerAllIntegrations() // idempotent; ensures registry is populated even if plugin hasn't run
  return listIntegrations().map(i => ({
    id: i.id,
    name: i.name,
    icon: i.icon,
    img: i.img,
    canTest: !!i.testConnection,
    monitoring: i.monitoring
      ? { kind: i.monitoring.kind, snapshotAction: i.monitoring.snapshotAction, targetSchema: i.monitoring.targetSchema }
      : undefined,
    connectionSchema: i.connectionSchema,
    triggers: i.triggers.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      kind: t.kind,
      needsConnection: t.needsConnection ?? false,
      configSchema: t.configSchema
    })),
    actions: i.actions.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      needsConnection: a.needsConnection ?? false,
      inputSchema: a.inputSchema,
      outputKeys: a.outputKeys ?? []
    }))
  }))
})
