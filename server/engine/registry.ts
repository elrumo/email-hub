import type { ActionDef, Integration, TriggerDef } from './types'

/**
 * The integration registry. Integrations register themselves here at boot
 * (see server/integrations/index.ts). The engine resolves actions/triggers by
 * id through this registry and never imports an integration module directly.
 */
const integrations = new Map<string, Integration>()

export function registerIntegration(integration: Integration): void {
  if (integrations.has(integration.id)) {
    throw new Error(`[registry] duplicate integration id: ${integration.id}`)
  }
  integrations.set(integration.id, integration)
}

/**
 * Add or replace an integration. Unlike `registerIntegration`, this does NOT
 * throw on an existing id — it overwrites. Used to (re)load user-uploaded
 * connectors, which can change at runtime (create/update). Never use it for
 * built-ins (their ids are static and a collision is a bug).
 */
export function upsertIntegration(integration: Integration): void {
  integrations.set(integration.id, integration)
}

/** Remove an integration by id (e.g. when a user deletes/disables a connector). */
export function unregisterIntegration(id: string): void {
  integrations.delete(id)
}

/** True if an integration with this id is currently registered. */
export function hasIntegration(id: string): boolean {
  return integrations.has(id)
}

export function listIntegrations(): Integration[] {
  return [...integrations.values()]
}

export function getIntegration(id: string): Integration | undefined {
  return integrations.get(id)
}

export function getAction(
  integrationId: string,
  actionId: string
): ActionDef | undefined {
  return integrations.get(integrationId)?.actions.find(a => a.id === actionId)
}

export function getTrigger(
  integrationId: string,
  triggerId: string
): TriggerDef | undefined {
  return integrations.get(integrationId)?.triggers.find(t => t.id === triggerId)
}

/** test-only: wipe the registry between unit tests */
export function _resetRegistry(): void {
  integrations.clear()
}
