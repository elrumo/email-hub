import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { monitors } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { mergeSecrets, validateAgainstSchema } from '../../engine/validate'
import { registerAllIntegrations } from '../../integrations'

/**
 * Update a monitor. Body: { name?, targetConfig? }. Redacted/blank secrets in
 * targetConfig are merged from the saved config so the user needn't retype them.
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const existing = (await db.select().from(monitors).where(eq(monitors.id, id)))[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'monitor not found' })

  const update: Record<string, unknown> = { updatedAt: Date.now() }
  if (body?.name !== undefined) update.name = String(body.name).trim()

  if (body?.targetConfig !== undefined) {
    const integration = getIntegration(existing.integrationId)
    const schema = integration?.monitoring?.targetSchema ?? []
    const merged = mergeSecrets(body.targetConfig ?? {}, existing.targetConfig, schema)
    const validated = validateAgainstSchema(merged, schema)
    if (!validated.ok) throw createError({ statusCode: 400, statusMessage: validated.error })
    update.targetConfig = validated.value
  }

  await db.update(monitors).set(update).where(eq(monitors.id, id))
  return { id, updated: true }
})
