import { generateText, jsonSchema, stepCountIs, tool } from 'ai'
import type { EmailDocument } from '#shared/email/blocks'
import { requireUser } from '../../../utils/auth'
import { getAssistantModel } from '../../../utils/ai'
import { planFor } from '../../../utils/plans'
import { messagesThisMonth, recordUsageForUser } from '../../../utils/usage'
import { requireOwnedProject } from '../../../utils/projects'
import { assertRateLimit } from '../../../utils/rateLimit'

interface SubjectIdea {
  subject: string
  preheader: string
  angle: string
}

const SYSTEM = [
  'You are Postcard AI, an expert email copywriter. Given an email\'s content, propose subject lines.',
  'You MUST call the suggest_subjects tool exactly once with 5 distinct ideas. Do not answer in prose.',
  'Each idea: subject under 50 characters, a complementary preheader under 100 characters (it continues the subject, never repeats it), and a 2-4 word "angle" label (e.g. "urgency", "curiosity", "plain benefit", "social proof", "personal").',
  'Vary the angles across the 5 ideas. Match the email\'s actual content and tone — no clickbait that the body can\'t cash.',
  'Keep {{ mustache }} variables available in the email if personalization helps (e.g. "{{ firstName }}, your invite is here").'
].join('\n')

/** Condense the email into a prompt-sized brief. */
function briefFor(doc: EmailDocument): string {
  const parts: string[] = []
  parts.push(`Current subject: ${doc.settings.title || '(none)'}`)
  parts.push(`Current preheader: ${doc.settings.preheader || '(none)'}`)
  const texts: string[] = []
  const walk = (blocks: EmailDocument['blocks']) => {
    for (const b of blocks) {
      if (b.type === 'heading') texts.push(b.text)
      if (b.type === 'text') texts.push(b.html.replace(/<[^>]+>/g, ' '))
      if (b.type === 'button') texts.push(`[CTA: ${b.label}]`)
      if (b.type === 'columns') for (const col of b.columns) walk(col)
    }
  }
  walk(doc.blocks)
  parts.push(`Email content:\n${texts.join('\n').replace(/\s+/g, ' ').trim().slice(0, 3000)}`)
  return parts.join('\n')
}

/**
 * AI subject line & preheader ideas for one email. Counts as one AI message
 * against the plan allowance, like a chat turn.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const project = await requireOwnedProject(id, user.id)

  assertRateLimit(event, 'ai-subjects', { limit: 10, windowMs: 5 * 60_000, key: user.id })

  const limit = planFor(user.plan).limits.aiMessagesPerMonth
  const used = await messagesThisMonth(user.id)
  if (used >= limit) {
    throw createError({
      statusCode: 402,
      statusMessage: `You've used all ${limit} AI messages in your plan this month. Upgrade for more.`
    })
  }

  const body = await readBody<{ document?: EmailDocument }>(event).catch(() => ({} as { document?: EmailDocument }))
  const doc = (body.document ?? project.document) as EmailDocument

  const { model, modelId } = getAssistantModel()
  let suggestions: SubjectIdea[] = []

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: briefFor(doc),
    stopWhen: stepCountIs(2),
    tools: {
      suggest_subjects: tool({
        description: 'Return 5 subject line ideas for this email.',
        inputSchema: jsonSchema<{ ideas: SubjectIdea[] }>({
          type: 'object',
          required: ['ideas'],
          properties: {
            ideas: {
              type: 'array',
              items: {
                type: 'object',
                required: ['subject', 'preheader', 'angle'],
                properties: {
                  subject: { type: 'string' },
                  preheader: { type: 'string' },
                  angle: { type: 'string' }
                }
              }
            }
          }
        }),
        execute: async ({ ideas }) => {
          suggestions = (ideas ?? [])
            .filter(i => (i?.subject ?? '').trim())
            .slice(0, 6)
            .map(i => ({
              subject: String(i.subject).trim().slice(0, 90),
              preheader: String(i.preheader ?? '').trim().slice(0, 140),
              angle: String(i.angle ?? '').trim().slice(0, 40)
            }))
          return `Received ${suggestions.length} ideas.`
        }
      })
    }
  })

  const u = (result.totalUsage ?? result.usage) as unknown as Record<string, number> | undefined
  await recordUsageForUser(user.id, id, modelId, {
    promptTokens: u?.promptTokens ?? u?.inputTokens,
    completionTokens: u?.completionTokens ?? u?.outputTokens,
    totalTokens: u?.totalTokens
  })

  if (!suggestions.length) {
    throw createError({ statusCode: 502, statusMessage: 'The assistant did not produce suggestions — try again.' })
  }
  return { suggestions }
})
