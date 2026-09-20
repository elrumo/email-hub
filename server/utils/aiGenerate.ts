import { generateText, jsonSchema, stepCountIs, tool } from 'ai'
import { emptyDocument, type EmailDocument } from '#shared/email/blocks'
import { setDocument } from '#shared/email/ops'
import { createError } from 'h3'
import type { AppUser } from './parse'
import { assertAiConfigured, getAssistantModel } from './ai'
import { planFor } from './plans'
import { messagesThisMonth, recordUsageForUser } from './usage'

const GENERATE_SYSTEM = [
  'You are Postcard AI, an expert email designer. Build a complete email document from the user\'s brief.',
  '',
  'You MUST call the set_document tool exactly once with the finished email. Do not answer in prose.',
  '',
  'The document shape is { settings, blocks }:',
  '- settings: { title (the subject line), preheader, backgroundColor, contentBackground, contentWidth (~600), fontFamily, textColor }',
  '- blocks: an ordered array of typed blocks:',
  '  - heading: { type:"heading", text, level (1-3), align, color? }',
  '  - text: { type:"text", html (inline tags only: b,i,u,a,br,span), align, color?, fontSize? }',
  '  - button: { type:"button", label, href, align, backgroundColor, color, radius? }',
  '  - image: { type:"image", src, alt, href?, align, width? }',
  '  - divider: { type:"divider", color?, thickness? }',
  '  - spacer: { type:"spacer", height }',
  '  - columns: { type:"columns", columns: block[][], gap? }',
  'All blocks also accept { padding?, background? }.',
  '',
  'Guidance: real, sensible copy; accessible contrast; use {{ mustache }} placeholders for personalization when the brief implies it; never hotlink random images — use clearly-labelled placeholders (e.g. dummyimage.com).'
].join('\n')

/**
 * One-shot email generation for the public API: enforces the plan's AI
 * allowance, asks the model to produce a full document via set_document, and
 * meters usage. Returns the generated document.
 */
export async function generateEmailDocument(user: AppUser, prompt: string): Promise<EmailDocument> {
  assertAiConfigured()
  const limit = planFor(user.plan).limits.aiMessagesPerMonth
  const used = await messagesThisMonth(user.id)
  if (used >= limit) {
    throw createError({
      statusCode: 402,
      statusMessage: `You've used all ${limit} AI messages in your plan this month. Upgrade for more.`
    })
  }

  const { model, modelId } = getAssistantModel()
  let doc: EmailDocument | null = null

  const result = await generateText({
    model,
    system: GENERATE_SYSTEM,
    prompt,
    stopWhen: stepCountIs(3),
    tools: {
      set_document: tool({
        description: 'Set the finished email document (settings + ordered blocks).',
        inputSchema: jsonSchema<{ document: EmailDocument }>({
          type: 'object',
          required: ['document'],
          properties: {
            document: {
              type: 'object',
              required: ['settings', 'blocks'],
              properties: { settings: { type: 'object' }, blocks: { type: 'array', items: { type: 'object' } } }
            }
          }
        }),
        execute: async ({ document }) => {
          const res = setDocument(emptyDocument(), document)
          if (res.ok) doc = res.doc
          return res.message
        }
      })
    }
  })

  const u = (result.totalUsage ?? result.usage) as unknown as Record<string, number> | undefined
  await recordUsageForUser(user.id, null, modelId, {
    promptTokens: u?.promptTokens ?? u?.inputTokens,
    completionTokens: u?.completionTokens ?? u?.outputTokens,
    totalTokens: u?.totalTokens
  })

  if (!doc) {
    throw createError({ statusCode: 502, statusMessage: 'The assistant did not produce an email. Try rephrasing the prompt.' })
  }
  return doc
}
