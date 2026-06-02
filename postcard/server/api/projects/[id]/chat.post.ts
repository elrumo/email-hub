/**
 * Postcard AI — the email designer's chat endpoint.
 *
 * The assistant edits the typed block document via tools (never raw HTML for the
 * whole email), streaming the working document back so the live preview updates
 * as it works. Token usage is metered per user, and the monthly message
 * allowance for the user's plan is enforced before generation. The underlying
 * provider/model is never referenced in any response — the product only knows
 * "Postcard AI".
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
import { eq } from 'drizzle-orm'
import { emptyDocument, findBlock, type EmailDocument } from '#shared/email/blocks'
import {
  addBlock,
  moveBlock,
  removeBlock,
  setDocument,
  updateBlock,
  updateSettings
} from '#shared/email/ops'
import { renderEmailHtml } from '#shared/email/render'
import { getDb } from '../../../db'
import { emailChatMessages, emailProjects } from '../../../db/schema'
import { requireUser } from '../../../utils/auth'
import { getAssistantModel } from '../../../utils/ai'
import { planFor } from '../../../utils/plans'
import { messagesThisMonth, recordUsage } from '../../../utils/usage'
import { reconcileVariables, requireOwnedProject } from '../../../utils/projects'

const BLOCK_TYPES = ['heading', 'text', 'button', 'image', 'divider', 'spacer', 'columns', 'html'] as const

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
    'Guidance:',
    '- When the user asks for a whole new email or a big redesign, prefer set_document with the full block list.',
    '- For targeted tweaks, use update_block / update_settings / add_block / remove_block / move_block.',
    '- Keep content width-friendly (~600px), use real, sensible copy, and accessible color contrast.',
    '- IMAGES: never invent or hotlink random image URLs. Use clearly-labelled placeholder URLs (e.g. dummyimage.com) for layout and tell the user to swap them for their own.',
    '- After editing, briefly tell the user what you changed. Do not dump the JSON or HTML.',
    '',
    `Current document settings: ${JSON.stringify(doc.settings)}.`,
    `Current top-level blocks (id:type): ${doc.blocks.map(b => `${b.id}:${b.type}`).join(', ') || '(none)'}.`,
    selected
      ? `The user has SELECTED this block — assume edits target it unless they say otherwise:\n${JSON.stringify(selected)}`
      : 'No block is currently selected.'
  ].join('\n')
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const projectId = getRouterParam(event, 'id')!
  const project = await requireOwnedProject(projectId, user.id)

  // Enforce the plan's monthly assistant allowance.
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

  const db = getDb()
  let doc: EmailDocument = body.document ?? (project.document as EmailDocument) ?? emptyDocument()
  const selectedId = body.selectedId

  const incoming = body.messages ?? []
  const lastUser = [...incoming].reverse().find(m => m.role === 'user')
  if (lastUser) {
    await db.insert(emailChatMessages).values({
      id: lastUser.id || randomUUID(),
      projectId,
      role: 'user',
      parts: lastUser.parts as unknown[],
      createdAt: Date.now()
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
        stopWhen: stepCountIs(8),
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
    onFinish: async ({ responseMessage }) => {
      if (responseMessage) {
        await db.insert(emailChatMessages).values({
          id: responseMessage.id || randomUUID(),
          projectId,
          role: 'assistant',
          parts: responseMessage.parts as unknown[],
          createdAt: Date.now()
        })
      }
      void renderEmailHtml(doc)
      await db.update(emailProjects)
        .set({
          document: doc,
          variables: reconcileVariables(doc, project.variables ?? []),
          updatedAt: Date.now()
        })
        .where(eq(emailProjects.id, projectId))
      await recordUsage(user.id, projectId, modelId, captured)
    }
  })

  return createUIMessageStreamResponse({ stream })
})
