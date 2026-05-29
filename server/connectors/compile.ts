/**
 * Compile a declarative `ConnectorDef` into a runtime `Integration` the engine
 * can register and run. The synthesized `run`/`testConnection` close over the
 * recipe and delegate to the generic interpreter (`server/connectors/http.ts`).
 *
 * User-connector ids are namespaced with `USER_PREFIX` so a community connector
 * can NEVER shadow a built-in integration id (the registry throws on dupes, and
 * this keeps the two namespaces disjoint). The stored `ConnectorDef.id` stays
 * un-prefixed; only the registered `Integration.id` is prefixed.
 */

import type { ActionDef, Integration, TestResult } from '../engine/types'
import { executeRecipe, mapOutput, type RecipeScope } from './http'
import type { ConnectorAction, ConnectorDef } from './types'

/** Namespace prefix for user-uploaded connectors. */
export const USER_PREFIX = 'x-'

export function userIntegrationId(connectorId: string): string {
  return USER_PREFIX + connectorId
}

export function isUserIntegrationId(id: string): boolean {
  return id.startsWith(USER_PREFIX)
}

function compileAction(action: ConnectorAction): ActionDef {
  const outputKeys = action.outputKeys
    ?? (action.output ? Object.keys(action.output) : ['status', 'ok', 'body'])

  return {
    id: action.id,
    name: action.name,
    description: action.description,
    needsConnection: action.needsConnection,
    inputSchema: action.inputSchema,
    outputKeys,
    run: async (ctx) => {
      const scope: RecipeScope = {
        connection: ctx.connection?.config ?? {},
        input: ctx.input
      }
      const result = await executeRecipe(action.request, scope, ctx.signal, ctx.log)
      return mapOutput(result, action.output)
    }
  }
}

export function compileConnector(def: ConnectorDef): Integration {
  const integration: Integration = {
    id: userIntegrationId(def.id),
    name: def.name,
    icon: def.icon,
    img: def.img,
    connectionSchema: def.connectionSchema,
    triggers: [],
    actions: def.actions.map(compileAction)
  }

  if (def.test) {
    const test = def.test
    integration.testConnection = async (config, signal): Promise<TestResult> => {
      try {
        const scope: RecipeScope = { connection: config, input: {} }
        const result = await executeRecipe(test.request, scope, signal)
        if (result.ok) {
          return { ok: true, message: test.okMessage ?? 'Connected' }
        }
        return { ok: false, message: `Test request returned ${result.status}` }
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Test request failed' }
      }
    }
  }

  return integration
}
