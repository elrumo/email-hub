import { randomUUID } from 'node:crypto'
import { emptyDocument, type EmailDocument } from '#shared/email/blocks'
import { getDb } from '../../db'
import { emailProjects } from '../../db/schema'

/** Create an email project. Accepts an optional name and starting document. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const name = String(body?.name ?? '').trim() || 'Untitled email'
  const document: EmailDocument = body?.document ?? emptyDocument()

  const db = getDb()
  const now = Date.now()
  const id = randomUUID()
  await db.insert(emailProjects).values({
    id,
    name,
    document: document as unknown as Record<string, unknown>,
    createdAt: now,
    updatedAt: now
  })

  setResponseStatus(event, 201)
  return { id, name }
})
