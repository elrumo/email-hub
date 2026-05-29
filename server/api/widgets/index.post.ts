import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { widgets } from '../../db/schema'
import { requireUser } from '../../utils/auth'
import { normalizeWidgetBody, resolveOwnedBoard } from './_shared'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  const fields = normalizeWidgetBody(body, {})

  const db = getDb()
  const boardId = await resolveOwnedBoard(db, user.id, body?.boardId ? String(body.boardId) : null)
  const now = Date.now()
  const id = randomUUID()
  await db.insert(widgets).values({
    id,
    ownerId: user.id,
    boardId,
    ...fields,
    createdAt: now,
    updatedAt: now
  })

  setResponseStatus(event, 201)
  return { id }
})
