import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { widgets } from '../../db/schema'
import { normalizeWidgetBody } from './_shared'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const fields = normalizeWidgetBody(body, {})

  const db = getDb()
  const now = Date.now()
  const id = randomUUID()
  await db.insert(widgets).values({
    id,
    ...fields,
    createdAt: now,
    updatedAt: now
  })

  setResponseStatus(event, 201)
  return { id }
})
