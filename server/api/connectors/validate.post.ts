import { validateConnectorDef } from '../../connectors/validate'

/**
 * Dry-run validation for the upload UI: returns { ok, error?, summary? }
 * without persisting anything. Lets the user paste a connector JSON and see
 * whether it's valid (and a quick summary) before installing.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const result = validateConnectorDef(body?.def)
  if (!result.ok || !result.value) {
    return { ok: false, error: result.error }
  }
  const def = result.value
  return {
    ok: true,
    summary: {
      id: def.id,
      name: def.name,
      author: def.meta?.author,
      version: def.meta?.version,
      connectionFields: def.connectionSchema.length,
      actions: def.actions.map(a => ({ id: a.id, name: a.name, method: a.request.method }))
    }
  }
})
