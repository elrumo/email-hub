import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { flows } from '../../db/schema'
import { validateFlowDefinition } from '../../engine/validateFlow'
import { registerAllIntegrations } from '../../integrations'
import { logActivity, requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const db = getDb()
  const rows = await db.select().from(flows).where(and(eq(flows.id, id), eq(flows.ownerId, user.id)))
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'flow not found' })

  const update: Record<string, unknown> = { updatedAt: Date.now() }

  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
    update.name = name
  }
  if (body?.description !== undefined) update.description = body.description ? String(body.description) : null
  if (body?.publicTrigger !== undefined) update.publicTrigger = !!body.publicTrigger
  if (body?.enabled !== undefined) {
    update.enabled = !!body.enabled
    // Re-enabling clears the cron bookkeeping so a one-time 'at' (which
    // auto-disables after firing) can be armed again and a recurring flow
    // isn't suppressed by a stale same-minute guard.
    if (!!body.enabled && !existing.enabled) update.lastRunAt = null
  }
  if (body?.definition !== undefined) {
    const validation = validateFlowDefinition(body.definition)
    if (!validation.ok) throw createError({ statusCode: 400, statusMessage: validation.error })
    update.definition = body.definition
    update.cron = validation.cron
    update.runAt = validation.runAt
    update.timezone = validation.timezone
    // The schedule may have changed; reset the same-minute / one-time guard so
    // the new schedule fires when due rather than being deduped against the old.
    if (validation.cron !== existing.cron || validation.runAt !== existing.runAt) {
      update.lastRunAt = null
    }
  }

  await db.update(flows).set(update).where(and(eq(flows.id, id), eq(flows.ownerId, user.id)))
  await logActivity(user.id, 'flow.update', { entityType: 'flow', entityId: id })
  return { id, updated: true }
})
