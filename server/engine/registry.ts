import type { ActionDef, Integration, TriggerDef } from "./types";

/**
 * The integration registry. Integrations register themselves here at boot
 * (see server/integrations/index.ts). The engine resolves actions/triggers by
 * id through this registry and never imports an integration module directly.
 */
const integrations = new Map<string, Integration>();

export function registerIntegration(integration: Integration): void {
  if (integrations.has(integration.id)) {
    throw new Error(`[registry] duplicate integration id: ${integration.id}`);
  }
  integrations.set(integration.id, integration);
}

export function listIntegrations(): Integration[] {
  return [...integrations.values()];
}

export function getIntegration(id: string): Integration | undefined {
  return integrations.get(id);
}

export function getAction(
  integrationId: string,
  actionId: string
): ActionDef | undefined {
  return integrations.get(integrationId)?.actions.find((a) => a.id === actionId);
}

export function getTrigger(
  integrationId: string,
  triggerId: string
): TriggerDef | undefined {
  return integrations.get(integrationId)?.triggers.find((t) => t.id === triggerId);
}

/** test-only: wipe the registry between unit tests */
export function _resetRegistry(): void {
  integrations.clear();
}
