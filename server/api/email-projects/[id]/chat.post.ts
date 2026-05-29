/**
 * The email designer's AI chat endpoint.
 *
 * Flow:
 *  1. Receive the conversation (`messages`, AI SDK UIMessage[]), the current
 *     email `document`, and the optionally `selectedId` block the user clicked.
 *  2. Persist the newest user message to the project's chat history.
 *  3. Run `streamText` against the user's configured AI connection, exposing a
 *     set of document-editing tools. The tools mutate a single working copy of
 *     the document (`doc`) so the model can chain edits in one turn.
 *  4. After each tool edit (and at the end) push the working document to the
 *     client as a `data-document` part so the live preview updates immediately.
 *  5. On finish, persist the assistant message and the final document.
 *
 * The model never emits raw HTML for the whole email — it calls tools that
 * operate on the typed block model, which the renderer turns into email-safe
 * HTML. The one exception is the `html` block type (an escape hatch).
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
import { resolveAiModel } from '../../../utils/aiModel'

const BLOCK_TYPES = ['heading', 'text', 'button', 'image', 'divider', 'spacer', 'columns', 'html'] as const

function systemPrompt(doc: EmailDocument, selectedId?: string): string {
  const selected = selectedId ? findBlock(doc.blocks, selectedId) : null
  return [
    'You are an expert email designer embedded in a visual email builder.',
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
    'Guidance:',
    '- When the user asks for a whole new email or a big redesign, prefer set_document with the full block list.',
    '- For targeted tweaks, use update_block / update_settings / add_block / remove_block / move_block.',
    '- Keep content width-friendly (~600px), use real, sensible copy, and accessible color contrast.',
    '- IMAGES: never invent or hotlink random image URLs. If the user wants their own image/logo/file, tell them to upload it via the "Add block → Upload image/file" menu or the "Upload image" button in the image block inspector — uploads go to their S3 storage and get a permanent public URL you can then reference. You MAY use clearly-labelled placeholder URLs (e.g. via.placeholder.com) for layout, and tell the user to replace them by uploading.',
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
  const projectId = getRouterParam(event, 'id')!
  const body = await readBody(event) as {
    messages: UIMessage[]
    document?: EmailDocument
    selectedId?: string
    connectionId?: string
  }

  const db = getDb()
  const projectRows = await db.select().from(emailProjects).where(eq(emailProjects.id, projectId))
  const project = projectRows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'email project not found' })

  // The client sends the live document (it may have unsaved edits); fall back to
  // the stored one. This single mutable copy is what the tools edit.
  let doc: EmailDocument = body.document ?? (project.document as unknown as EmailDocument) ?? emptyDocument()
  const selectedId = body.selectedId

  // Persist the latest user message before generating (so history survives a
  // mid-stream disconnect).
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

  const { model } = await resolveAiModel(body.connectionId)

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Helper: apply an op result, keep the working doc, and push it live.
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
                properties: {
                  settings: { type: 'object' },
                  blocks: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }),
          execute: async ({ document }) => apply(setDocument(doc, document))
        }),
        update_settings: tool({
          description: 'Patch document-level settings: title (subject), preheader, backgroundColor, contentBackground, contentWidth, fontFamily, textColor.',
          inputSchema: jsonSchema<{ patch: Record<string, unknown> }>({
            type: 'object',
            required: ['patch'],
            properties: { patch: { type: 'object' } }
          }),
          execute: async ({ patch }) => apply(updateSettings(doc, patch as Partial<EmailDocument['settings']>))
        }),
        update_block: tool({
          description: 'Update fields of one existing block, identified by its id. Only pass the fields you want to change. Cannot change a block\'s type.',
          inputSchema: jsonSchema<{ id: string, patch: Record<string, unknown> }>({
            type: 'object',
            required: ['id', 'patch'],
            properties: { id: { type: 'string' }, patch: { type: 'object' } }
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
          inputSchema: jsonSchema<{ id: string }>({
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } }
          }),
          execute: async ({ id }) => apply(removeBlock(doc, id))
        }),
        move_block: tool({
          description: 'Move a top-level block to a new index.',
          inputSchema: jsonSchema<{ id: string, to: number }>({
            type: 'object',
            required: ['id', 'to'],
            properties: { id: { type: 'string' }, to: { type: 'number' } }
          }),
          execute: async ({ id, to }) => apply(moveBlock(doc, id, to))
        })
      }

      const result = streamText({
        model,
        system: systemPrompt(doc, selectedId),
        messages: await convertToModelMessages(incoming),
        tools,
        stopWhen: stepCountIs(8)
      })

      writer.merge(result.toUIMessageStream())
    },
    onFinish: async ({ responseMessage }) => {
      // Persist the assistant's reply and the final edited document.
      if (responseMessage) {
        await db.insert(emailChatMessages).values({
          id: responseMessage.id || randomUUID(),
          projectId,
          role: 'assistant',
          parts: responseMessage.parts as unknown[],
          createdAt: Date.now()
        })
      }
      // `renderEmailHtml` import keeps the renderer in the server bundle and
      // doubles as a cheap validity check that the doc renders.
      void renderEmailHtml(doc)
      await db.update(emailProjects)
        .set({ document: doc as unknown as Record<string, unknown>, updatedAt: Date.now() })
        .where(eq(emailProjects.id, projectId))
    }
  })

  return createUIMessageStreamResponse({ stream })
})
