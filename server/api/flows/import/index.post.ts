import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '../../../db'
import { connections, flows } from '../../../db/schema'
import { hasIntegration } from '../../../engine/registry'
import { validateFlowDefinition } from '../../../engine/validateFlow'
import { inspectBundle, rebindBundle, validateFlowBundle } from '../../../flows/import'
import { registerAllIntegrations } from '../../../integrations'
import { logActivity, requireUser } from '../../../utils/auth'

/**
 * Import a flow bundle into the user's account. Validates the bundle, ensures
 * every required connector is installed, re-binds the connection slots to the
 * user's chosen connections, then validates + creates the flow exactly like
 * POST /api/flows would.
 *
 * The imported flow is created DISABLED so a freshly-imported automation can't
 * fire before the user has reviewed it.
 *
 * Body: { bundle: FlowBundle, bindings: Record<placeholder, connectionId>, name? }
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
  const body = await readBody(event)

  const validation = validateFlowBundle(body?.bundle)
  if (!validation.ok || !validation.value) {
    throw createError({ statusCode: 400, statusMessage: validation.error ?? 'invalid bundle' })
  }
  const bundle = validation.value

  // 1) every required connector must be installed
  const inspected = inspectBundle(bundle, { has: hasIntegration })
  if (!inspected.ready) {
    const missing = inspected.connectors.filter(c => !c.installed).map(c => c.integrationId)
    throw createError({
      statusCode: 409,
      statusMessage: `missing connector(s): ${missing.join(', ')}. Install them before importing.`
    })
  }

  const bindings = (body?.bindings ?? {}) as Record<string, string>

  // 2) every bound connection must belong to THIS user and match the slot's
  //    integration — never let an import reference someone else's connection.
  const db = getDb()
  const boundIds = [...new Set(Object.values(bindings).filter(Boolean))]
  const owned = boundIds.length
    ? await db.select().from(connections).where(
        and(eq(connections.ownerId, user.id), inArray(connections.id, boundIds))
      )
    : []
  const ownedById = new Map(owned.map(c => [c.id, c]))

  for (const slot of bundle.requires) {
    const connId = bindings[slot.placeholder]
    const conn = connId ? ownedById.get(connId) : undefined
    if (!conn) {
      throw createError({ statusCode: 400, statusMessage: `pick a connection for "${slot.label}"` })
    }
    if (conn.integrationId !== slot.integrationId) {
      throw createError({
        statusCode: 400,
        statusMessage: `"${conn.name}" is a ${conn.integrationId} connection but "${slot.label}" needs ${slot.integrationId}`
      })
    }
  }

  // 3) re-bind placeholders → real connection ids
  const rebound = rebindBundle(bundle, bindings)
  if (!rebound.ok || !rebound.definition) {
    throw createError({ statusCode: 400, statusMessage: rebound.error ?? 'could not bind connections' })
  }

  // 4) validate against the registry (actions/triggers exist) + derive schedule
  const flowValidation = validateFlowDefinition(rebound.definition)
  if (!flowValidation.ok) {
    throw createError({ statusCode: 400, statusMessage: flowValidation.error })
  }

  const name = String(body?.name ?? bundle.name).trim() || bundle.name
  const now = Date.now()
  const id = randomUUID()
  await db.insert(flows).values({
    id,
    ownerId: user.id,
    name,
    description: bundle.description ?? null,
    enabled: false, // imported disabled — user reviews, then enables
    publicTrigger: false,
    definition: rebound.definition,
    cron: flowValidation.cron,
    runAt: flowValidation.runAt,
    timezone: flowValidation.timezone,
    createdAt: now,
    updatedAt: now
  })

  await logActivity(user.id, 'flow.import', { entityType: 'flow', entityId: id, detail: { name, from: bundle.meta?.author } })
  setResponseStatus(event, 201)
  return { id, name, enabled: false }
})
