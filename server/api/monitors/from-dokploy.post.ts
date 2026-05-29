import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections, monitors } from '../../db/schema'
import { resolveConnection } from '../../engine/connections'
import { discoverDokployMonitoring } from '../../integrations/dokploy-monitoring'

/**
 * Create monitor(s) for a Dokploy connection straight from the API — no UI.
 * Discovers the monitoring token + URL from Dokploy (user.getMetricsToken +
 * server.all), then creates one monitor per target that has a token.
 *
 * Body: { connectionId, serverId? }
 *  - serverId omitted → create a monitor for every target with a token
 *    (the Dokploy host + each remote server), skipping any that already exist.
 *  - serverId given ("" = the host) → create just that one.
 *
 * Idempotent: a target that already has a monitor (same connection + serverId)
 * is skipped, not duplicated. Returns { created: [...], skipped: [...] }.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const connectionId = String(body?.connectionId ?? '')
  const onlyServerId: string | undefined = body?.serverId !== undefined ? String(body.serverId) : undefined

  const db = getDb()
  const conn = (await db.select().from(connections).where(eq(connections.id, connectionId)))[0]
  if (!conn || conn.integrationId !== 'dokploy') {
    throw createError({ statusCode: 400, statusMessage: 'connectionId must reference a Dokploy connection' })
  }

  const connection = await resolveConnection(db, connectionId)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 15_000)
  let info
  try {
    info = await discoverDokployMonitoring(connection!, ac.signal)
  } catch (e) {
    throw createError({ statusCode: 502, statusMessage: e instanceof Error ? e.message : 'Dokploy discovery failed' })
  } finally {
    clearTimeout(timer)
  }

  // Which targets to consider, and only those with a usable token.
  let targets = info.targets.filter(t => t.metricsToken && t.metricsUrl)
  if (onlyServerId !== undefined) {
    targets = targets.filter(t => t.serverId === onlyServerId)
    if (targets.length === 0) {
      const picked = info.targets.find(t => t.serverId === onlyServerId)
      throw createError({
        statusCode: 400,
        statusMessage: picked
          ? `No monitoring token for "${picked.name}" — enable monitoring for it in Dokploy first.`
          : `No server with id "${onlyServerId}" found on this Dokploy.`
      })
    }
  }
  if (targets.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No monitorable targets found — enable monitoring in Dokploy (Web Server → Monitoring) so a token is generated.'
    })
  }

  // Existing monitors for this connection, keyed by serverId, to stay idempotent.
  const existing = await db.select().from(monitors).where(eq(monitors.connectionId, connectionId))
  const existingServerIds = new Set(
    existing.map(m => String((m.targetConfig as Record<string, unknown>)?.serverId ?? ''))
  )

  const created: Array<{ id: string, name: string, serverId: string }> = []
  const skipped: Array<{ name: string, serverId: string, reason: string }> = []
  const now = Date.now()

  for (const t of targets) {
    if (existingServerIds.has(t.serverId)) {
      skipped.push({ name: t.name, serverId: t.serverId, reason: 'monitor already exists' })
      continue
    }
    const id = randomUUID()
    await db.insert(monitors).values({
      id,
      connectionId,
      integrationId: 'dokploy',
      name: t.name,
      targetConfig: {
        metricsUrl: t.metricsUrl,
        metricsToken: t.metricsToken,
        serverId: t.serverId,
        dataPoints: '50'
      },
      createdAt: now,
      updatedAt: now
    })
    existingServerIds.add(t.serverId)
    created.push({ id, name: t.name, serverId: t.serverId })
  }

  setResponseStatus(event, created.length ? 201 : 200)
  return { created, skipped }
})
