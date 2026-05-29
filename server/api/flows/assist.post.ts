import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { connections } from '../../db/schema'
import { bunnyZoneDiscovery, kumaDiscovery, normalizeAssistQuestions, type AssistConnectionContext, type AssistContext, type AssistDiscoveryContext } from '../../engine/assistContext'
import { buildAssistSystemPrompt } from '../../engine/assistPrompt'
import { getIntegration } from '../../engine/registry'
import { validateFlowDefinition } from '../../engine/validateFlow'
import { chat } from '../../integrations/ai'
import { discoverBunnyZones } from '../../integrations/bunny'
import { registerAllIntegrations } from '../../integrations'
import { discoverKumaMonitors } from '../../integrations/kuma'
import { requireUser } from '../../utils/auth'

/**
 * AI-assisted flow authoring. Given the chat transcript and an AI connection,
 * asks the model to either ask clarifying questions or propose a full
 * FlowDefinition. Proposed flows are validated against the live registry with
 * `validateFlowDefinition`; on failure the route feeds the error back to the
 * model once (self-repair) before giving up.
 *
 * Body: { messages: { role: 'user' | 'assistant', content: string }[],
 *         connectionId?: string, model?: string }
 * Returns one of:
 *   { kind: 'questions', reply, questions }
 *   { kind: 'flow', reply, summary, flow }
 *   { kind: 'error', reply }   // model misbehaved / flow couldn't be validated
 */

interface ChatMsg { role: 'user' | 'assistant', content: string }

const MAX_REPAIR_ATTEMPTS = 1

export default defineEventHandler(async (event) => {
  registerAllIntegrations()
  const user = await requireUser(event)
  const body = await readBody(event)

  const messages: ChatMsg[] = Array.isArray(body?.messages)
    ? body.messages
        .filter((m: unknown): m is ChatMsg =>
          !!m && typeof m === 'object'
          && (((m as ChatMsg).role === 'user') || ((m as ChatMsg).role === 'assistant'))
          && typeof (m as ChatMsg).content === 'string')
        .map((m: ChatMsg) => ({ role: m.role, content: m.content }))
    : []
  if (!messages.length) throw createError({ statusCode: 400, statusMessage: 'messages is required' })

  // resolve the AI connection: explicit id → owner's default-marked ai conn → first ai conn
  const db = getDb()
  const allConns = await db
    .select()
    .from(connections)
    .where(eq(connections.ownerId, user.id))
  const aiConns = allConns.filter(c => c.integrationId === 'ai')

  let conn = body?.connectionId
    ? aiConns.find(c => c.id === String(body.connectionId))
    : undefined
  conn ??= aiConns.find(c => c.config?.defaultForAssist === true) ?? aiConns[0]
  if (!conn) throw createError({ statusCode: 400, statusMessage: 'no AI connection found — set one up first' })

  const config = { ...conn.config }
  const model = String(body?.model ?? '') || String(config.defaultModel ?? '')
  if (!model) throw createError({ statusCode: 400, statusMessage: 'no model set — choose one on the AI connection or in the picker' })

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 60_000)

  const connectionContext: AssistConnectionContext[] = allConns
    .filter(c => c.integrationId !== 'ai')
    .map(c => ({
      id: c.id,
      name: c.name,
      integrationId: c.integrationId,
      integrationName: getIntegration(c.integrationId)?.name ?? c.integrationId
    }))
  const connectionContextById = new Map(connectionContext.map(c => [c.id, c]))
  const discoveries: AssistDiscoveryContext[] = []

  await Promise.allSettled(allConns.map(async (saved) => {
    const safeConn = connectionContextById.get(saved.id)
    if (!safeConn) return

    if (saved.integrationId === 'kuma') {
      const baseUrl = String(saved.config.baseUrl ?? '')
      const apiKey = String(saved.config.apiKey ?? '')
      if (!baseUrl || !apiKey) return
      const monitors = await discoverKumaMonitors(baseUrl, apiKey, ac.signal)
      if (monitors.length) discoveries.push(kumaDiscovery(safeConn, monitors))
    }

    if (saved.integrationId === 'bunny') {
      const zones = await discoverBunnyZones(saved.config, ac.signal)
      if (zones.length) discoveries.push(bunnyZoneDiscovery(safeConn, zones))
    }
  }))

  const assistContext: AssistContext = {
    connections: connectionContext,
    discoveries
  }
  const system = buildAssistSystemPrompt(assistContext)

  // The transcript is flattened into one user turn — the AI integration's chat()
  // sends a single user message; the running conversation is rendered inline so
  // the model sees prior questions/answers in order.
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
    .join('\n\n')

  try {
    let userTurn = `Conversation so far:\n\n${transcript}\n\nRespond now with a single JSON object as instructed.`

    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      const raw = await chat(config, { system, user: userTurn, model, json: true, maxTokens: 2048 }, ac.signal)

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim())
      } catch {
        return { kind: 'error', reply: 'The model did not return a usable response. Try rephrasing.' }
      }

      const reply = typeof parsed.reply === 'string' ? parsed.reply : ''

      // shape A: clarifying questions
      if (Array.isArray(parsed.questions) && !parsed.flow) {
        const questions = normalizeAssistQuestions(parsed.questions)
        return { kind: 'questions', reply: reply || 'A couple of questions:', questions }
      }

      // shape B: a proposed flow
      if (parsed.flow && typeof parsed.flow === 'object') {
        const flow = parsed.flow as Record<string, unknown>
        const definition = {
          trigger: flow.trigger,
          steps: flow.steps,
          notifyOnRun: 'never'
        }
        const validation = validateFlowDefinition(definition)
        if (validation.ok) {
          return {
            kind: 'flow',
            reply: reply || 'Here’s a flow you can review.',
            summary: typeof flow.summary === 'string' ? flow.summary : (typeof parsed.summary === 'string' ? parsed.summary : ''),
            flow: {
              name: typeof flow.name === 'string' ? flow.name : 'New flow',
              description: typeof flow.description === 'string' ? flow.description : '',
              trigger: flow.trigger,
              steps: flow.steps
            }
          }
        }
        // self-repair: feed the validation error back once
        if (attempt < MAX_REPAIR_ATTEMPTS) {
          userTurn = `Conversation so far:\n\n${transcript}\n\nYour previous flow JSON was invalid: ${validation.error}\n`
            + `Fix it and respond again with a single JSON object (shape B). Only use integrationIds/actionIds that exist.`
          continue
        }
        return { kind: 'error', reply: `I couldn’t build a valid flow: ${validation.error}. Try describing it differently.` }
      }

      // neither shape — treat the reply as a plain message if present
      if (reply) return { kind: 'questions', reply, questions: [] }
      return { kind: 'error', reply: 'The model’s response was empty or malformed. Try again.' }
    }

    return { kind: 'error', reply: 'Could not produce a valid flow.' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'AI request failed'
    throw createError({ statusCode: 502, statusMessage: msg })
  } finally {
    clearTimeout(timer)
  }
})
