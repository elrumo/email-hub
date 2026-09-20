/**
 * Postcard AI — the email designer's chat endpoint.
 */
import { randomUUID } from 'node:crypto'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type UIMessage
} from 'ai'
import { emptyDocument, findBlock, type EmailDocument, type EmailTheme } from '#shared/email/blocks'
import { applyThemeToDocument, THEME_PRESETS } from '#shared/email/theme'
import {
  addBlock,
  moveBlock,
  removeBlock,
  setDocument,
  updateBlock,
  updateSettings
} from '#shared/email/ops'
import {
  createChatMessage,
  updateProject
} from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { assertAiConfigured, getAssistantModel } from '../../../utils/ai'
import { planFor } from '../../../utils/plans'
import { messagesThisMonth, recordUsageForUser } from '../../../utils/usage'
import { reconcileVariables, requireOwnedProject } from '../../../utils/projects'

const BLOCK_TYPES = ['heading', 'text', 'button', 'image', 'divider', 'spacer', 'columns', 'html'] as const

/** The full document, bounded so a giant email can't blow the context. */
function documentForPrompt(doc: EmailDocument): string {
  const json = JSON.stringify(doc)
  return json.length > 14000 ? `${json.slice(0, 14000)}…(truncated — use block ids above to target edits)` : json
}

function systemPrompt(doc: EmailDocument, selectedId?: string): string {
  const selected = selectedId ? findBlock(doc.blocks, selectedId) : null
  return [
    'You are Postcard AI, an expert email designer embedded in a visual email builder.',
    'You design marketing and transactional emails that render correctly across Gmail, Apple Mail and Outlook.',
    '',
    'The email is a structured document of typed BLOCKS (not raw HTML). You edit it ONLY by calling the provided tools. Never paste HTML into chat — make the change with a tool.',
    '',
    'Block types and their key fields:',
    '- heading: { text, level (1-3), align, color? }',
    '- text: { html (inline tags only: b,i,u,a,br,span), align, color?, fontSize? }',
    '- button: { label, href, align, backgroundColor, color, radius? }',
    '- image: { src, alt, href?, align, width? }',
    '- divider: { color?, thickness? }',
    '- spacer: { height }',
    '- columns: { columns: block[][], gap? }',
    '- html: raw email-safe HTML escape hatch — use ONLY when a structured block cannot express it; always table-based with inline styles.',
    'All blocks also support: { padding?, background? }. `padding` can be a single number or { top, right, bottom, left } in px.',
    '',
    'Template variables: the user can insert {{ mustache }} placeholders anywhere text is allowed (e.g. "Hi {{ firstName }}"). When the user asks for personalization, use {{ key }} placeholders with clear, snake/camelCase keys and tell them which variables you added — they will be substituted later via the API.',
    '',
    'Theming: when the user asks to change the look/feel/colors/vibe WITHOUT changing content or layout ("make it dark", "more playful", "match my brand green"), use set_theme — it restyles every block from design tokens. Available presets: ' + THEME_PRESETS.map(p => p.id).join(', ') + '. You can pass a preset, individual tokens, or both (tokens override the preset).',
    '',
    'Guidance:',
    '- When the user asks for a whole new email or a big redesign, prefer set_document with the full block list.',
    '- For targeted tweaks, use update_block / update_settings / add_block / remove_block / move_block.',
    '- Keep content width-friendly (~600px), use real, sensible copy, and accessible color contrast.',
    '- Structure quality: lead with a clear hero (heading + supporting text), one primary CTA button, generous spacer rhythm, and a muted footer (small text block) with the sender address and an unsubscribe line.',
    '- Copy quality: concrete and concise; subject (settings.title) under ~50 chars; always set a preheader that complements the subject.',
    '- IMAGES: never invent or hotlink random image URLs. Use clearly-labelled placeholder URLs (e.g. dummyimage.com) for layout and tell the user to swap them for their own.',
    '- If a request is ambiguous, make the most reasonable choice and note the assumption in one short sentence — do not stall by asking questions for simple edits.',
    '- After editing, briefly tell the user what you changed. Do not dump the JSON or HTML.',
    '',
    `Current top-level blocks (id:type): ${doc.blocks.map(b => `${b.id}:${b.type}`).join(', ') || '(none)'}.`,
    `Current document JSON: ${documentForPrompt(doc)}`,
    selected
      ? `The user has SELECTED this block — assume edits target it unless they say otherwise:\n${JSON.stringify(selected)}`
      : 'No block is currently selected.'
  ].join('\n')
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  assertAiConfigured()
  const projectId = getRouterParam(event, 'id')!
  const project = await requireOwnedProject(projectId, user.id)

  const limit = planFor(user.plan).limits.aiMessagesPerMonth
  const used = await messagesThisMonth(user.id)
  if (used >= limit) {
    throw createError({
      statusCode: 402,
      statusMessage: `You've used all ${limit} AI messages in your plan this month. Upgrade for more.`
    })
  }

  const body = await readBody(event) as {
    messages: UIMessage[]
    document?: EmailDocument
    selectedId?: string
  }

  let doc: EmailDocument = body.document ?? project.document ?? emptyDocument()
  const selectedId = body.selectedId
  // Cap the history sent upstream — old turns matter less than the current
  // document state (which is always included in the system prompt).
  const incoming = (body.messages ?? []).slice(-30)
  if (!incoming.length) {
    throw createError({ statusCode: 422, statusMessage: 'No messages provided.' })
  }
  const lastUser = [...incoming].reverse().find(m => m.role === 'user')
  if (lastUser) {
    await createChatMessage({
      clientId: lastUser.id || randomUUID(),
      projectId,
      role: 'user',
      parts: lastUser.parts as unknown[]
    })
  }

  const { model, modelId } = getAssistantModel()
  let captured: { promptTokens?: number, completionTokens?: number, totalTokens?: number } = {}

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const apply = (res: { ok: boolean, message: string, doc: EmailDocument }) => {
        if (res.ok) {
          doc = res.doc
          writer.write({ type: 'data-document', data: doc as unknown as Record<string, unknown> })
        }
        return res.message
      }

      const tools = {
        set_document: tool({
          description: 'Replace the ENTIRE email with a new document (settings + ordered blocks). Use for new emails or major redesigns.',
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
          execute: async ({ document }) => apply(setDocument(doc, document))
        }),
        update_settings: tool({
          description: 'Patch document-level settings: title (subject), preheader, backgroundColor, contentBackground, contentWidth, fontFamily, textColor.',
          inputSchema: jsonSchema<{ patch: Record<string, unknown> }>({
            type: 'object', required: ['patch'], properties: { patch: { type: 'object' } }
          }),
          execute: async ({ patch }) => apply(updateSettings(doc, patch as Partial<EmailDocument['settings']>))
        }),
        update_block: tool({
          description: 'Update fields of one existing block by id. Only pass fields to change. Cannot change a block\'s type.',
          inputSchema: jsonSchema<{ id: string, patch: Record<string, unknown> }>({
            type: 'object', required: ['id', 'patch'], properties: { id: { type: 'string' }, patch: { type: 'object' } }
          }),
          execute: async ({ id, patch }) => apply(updateBlock(doc, id, patch))
        }),
        add_block: tool({
          description: 'Add a new block. Optionally set its position among top-level blocks (0 = first).',
          inputSchema: jsonSchema<{ type: string, props?: Record<string, unknown>, at?: number }>({
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: BLOCK_TYPES as unknown as string[] },
              props: { type: 'object' },
              at: { type: 'number' }
            }
          }),
          execute: async ({ type, props, at }) => apply(addBlock(doc, type as typeof BLOCK_TYPES[number], props ?? {}, at))
        }),
        remove_block: tool({
          description: 'Remove a block by id.',
          inputSchema: jsonSchema<{ id: string }>({ type: 'object', required: ['id'], properties: { id: { type: 'string' } } }),
          execute: async ({ id }) => apply(removeBlock(doc, id))
        }),
        set_theme: tool({
          description: 'Restyle the whole email via design tokens (colors, font, button radius) without touching layout or copy. Pass a preset id and/or individual tokens; tokens override the preset.',
          inputSchema: jsonSchema<{ preset?: string, tokens?: Partial<EmailTheme> }>({
            type: 'object',
            properties: {
              preset: { type: 'string', enum: THEME_PRESETS.map(p => p.id) },
              tokens: {
                type: 'object',
                properties: {
                  brand: { type: 'string' },
                  onBrand: { type: 'string' },
                  background: { type: 'string' },
                  surface: { type: 'string' },
                  heading: { type: 'string' },
                  text: { type: 'string' },
                  muted: { type: 'string' },
                  fontFamily: { type: 'string' },
                  radius: { type: 'number' }
                }
              }
            }
          }),
          execute: async ({ preset, tokens }) => {
            const base = preset ? THEME_PRESETS.find(p => p.id === preset)?.theme : undefined
            const patch = { ...(base ?? {}), ...(tokens ?? {}) }
            if (!Object.keys(patch).length) return 'No theme tokens provided.'
            return apply({ ok: true, message: 'Theme applied.', doc: applyThemeToDocument(doc, patch) })
          }
        }),
        move_block: tool({
          description: 'Move a top-level block to a new index.',
          inputSchema: jsonSchema<{ id: string, to: number }>({
            type: 'object', required: ['id', 'to'], properties: { id: { type: 'string' }, to: { type: 'number' } }
          }),
          execute: async ({ id, to }) => apply(moveBlock(doc, id, to))
        })
      }

      const result = streamText({
        model,
        system: systemPrompt(doc, selectedId),
        messages: await convertToModelMessages(incoming),
        tools,
        maxRetries: 3,
        stopWhen: stepCountIs(12),
        onFinish: ({ usage, totalUsage }) => {
          const u = (totalUsage ?? usage) as unknown as Record<string, number> | undefined
          if (u) {
            captured = {
              promptTokens: u.promptTokens ?? u.inputTokens,
              completionTokens: u.completionTokens ?? u.outputTokens,
              totalTokens: u.totalTokens
            }
          }
        }
      })

      writer.merge(result.toUIMessageStream())
    },
    // Surface a readable message in the chat instead of a dead stream.
    onError: (e) => {
      console.error('[chat] stream error:', e instanceof Error ? e.message : e)
      return 'Postcard AI hit a temporary problem talking to the model. Your email is unchanged — try sending that again.'
    },
    onFinish: async ({ responseMessage }) => {
      try {
        if (responseMessage) {
          await createChatMessage({
            clientId: responseMessage.id || randomUUID(),
            projectId,
            role: 'assistant',
            parts: responseMessage.parts as unknown[]
          })
        }
        await updateProject(projectId, {
          document: doc,
          variables: reconcileVariables(doc, project.variables ?? [])
        })
      } catch (e) {
        // Persistence must not kill the stream; the client still holds the doc
        // and its autosave will retry.
        console.error('[chat] persist failed:', e instanceof Error ? e.message : e)
      }
      await recordUsageForUser(user.id, projectId, modelId, captured)
    }
  })

  return createUIMessageStreamResponse({ stream })
})
