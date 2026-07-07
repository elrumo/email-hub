import type Parse from 'parse/node'
import { getProject, initParse, getParseServerUrl } from '../../../utils/parse'
import { requireEmailAccess } from '../../../utils/access'

/**
 * Live document sync for multiplayer editing. Every viewer/editor of an email
 * opens this SSE stream; whenever the document is saved by anyone, an update
 * event carrying the new document is pushed to everyone else.
 *
 * The primary transport is a Parse Live Query subscription on the EmailProject
 * row (enable with PARSE_SERVER_LIVE_QUERY on the Parse server and
 * PARSE_LIVEQUERY_URL here). When Live Query isn't available the stream
 * degrades to polling the row every few seconds — same events, higher latency.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await requireEmailAccess(event, id, 'view')

  const stream = createEventStream(event)
  let lastSent = 0
  let closed = false

  const push = async () => {
    const fresh = await getProject(id).catch(() => null)
    if (!fresh || closed) return
    if (fresh.updatedAt <= lastSent) return
    lastSent = fresh.updatedAt
    await stream.push(JSON.stringify({
      document: fresh.document,
      variables: fresh.variables ?? [],
      name: fresh.name,
      actorId: fresh.lastActorId ?? null,
      updatedAt: fresh.updatedAt
    }))
  }

  // Baseline so we only push *changes* after connect.
  const current = await getProject(id).catch(() => null)
  lastSent = current?.updatedAt ?? Date.now()

  let subscription: { unsubscribe: () => void } | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const startPolling = () => {
    if (!pollTimer) pollTimer = setInterval(push, 3000)
  }

  const liveQueryUrl = process.env.PARSE_LIVEQUERY_URL
    || getParseServerUrl().replace(/^http/, 'ws')
  try {
    const P = initParse() as typeof Parse & { liveQueryServerURL?: string }
    P.liveQueryServerURL = liveQueryUrl
    const query = new P.Query('EmailProject')
    query.equalTo('objectId', id)
    const sub = await query.subscribe()
    sub.on('update', () => { void push() })
    sub.on('close', () => { if (!closed) startPolling() })
    subscription = sub as unknown as { unsubscribe: () => void }
  } catch (e) {
    console.warn('[live] LiveQuery unavailable, falling back to polling:', e instanceof Error ? e.message : e)
    startPolling()
  }

  // Heartbeat keeps proxies from cutting the stream.
  const heartbeat = setInterval(() => { void stream.push(': ping') }, 25000)

  stream.onClosed(() => {
    closed = true
    clearInterval(heartbeat)
    if (pollTimer) clearInterval(pollTimer)
    try {
      subscription?.unsubscribe()
    } catch { /* already closed */ }
  })

  return stream.send()
})
