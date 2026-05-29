import { getDb } from '../../db'
import { monitors } from '../../db/schema'
import { getIntegration } from '../../engine/registry'
import { redactTargetConfig, targetSchemaFor } from '../../engine/monitoring'
import { registerAllIntegrations } from '../../integrations'

/** List monitors. Secret values in targetConfig are redacted. */
export default defineEventHandler(async () => {
  registerAllIntegrations()
  const db = getDb()
  const rows = await db.select().from(monitors)
  return rows.map(m => ({
    id: m.id,
    connectionId: m.connectionId,
    integrationId: m.integrationId,
    name: m.name,
    targetConfig: redactTargetConfig(m.targetConfig, targetSchemaFor(getIntegration(m.integrationId))),
    createdAt: m.createdAt
  }))
})
