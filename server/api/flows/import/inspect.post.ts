import { eq } from 'drizzle-orm'
import { fetchRemoteJson } from '../../../connectors/fetchRemote'
import { getDb } from '../../../db'
import { connections } from '../../../db/schema'
import { hasIntegration } from '../../../engine/registry'
import { inspectBundle, validateFlowBundle } from '../../../flows/import'
import { registerAllIntegrations } from '../../../integrations'
import { requireUser } from '../../../utils/auth'

/**
 * Dry-run a flow bundle before importing: validate it, report which connectors
 * it needs (installed vs missing), and list the connection slots to fill —
 * each with the user's compatible connections so the UI can render a picker.
 *
 * Body: { bundle?: FlowBundle, url?: string }  (url fetched SSRF-guarded)
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
  const body = await readBody(event)

  let rawBundle = body?.bundle
  if (!rawBundle && typeof body?.url === 'string' && body.url.trim()) {
    rawBundle = await fetchRemoteJson(body.url)
  }

  const validation = validateFlowBundle(rawBundle)
  if (!validation.ok || !validation.value) {
    throw createError({ statusCode: 400, statusMessage: validation.error ?? 'invalid bundle' })
  }
  const bundle = validation.value

  const inspected = inspectBundle(bundle, { has: hasIntegration })

  // load the user's connections so the import UI can offer a picker per slot
  const db = getDb()
  const rows = await db.select().from(connections).where(eq(connections.ownerId, user.id))
  const byIntegration = new Map<string, Array<{ id: string, name: string }>>()
  for (const r of rows) {
    const list = byIntegration.get(r.integrationId) ?? []
    list.push({ id: r.id, name: r.name })
    byIntegration.set(r.integrationId, list)
  }

  const slots = inspected.slots.map(slot => ({
    ...slot,
    options: byIntegration.get(slot.integrationId) ?? []
  }))

  return { ...inspected, slots }
})
