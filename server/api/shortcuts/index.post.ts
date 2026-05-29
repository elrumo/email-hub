import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { shortcuts } from '../../db/schema'
import { normalizeShortcutBody } from './_shared'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const fields = normalizeShortcutBody(body, {})

  const db = getDb()
  const now = Date.now()
  const id = randomUUID()
  await db.insert(shortcuts).values({
    id,
    ...fields,
    createdAt: now,
    updatedAt: now
  })

  setResponseStatus(event, 201)
  return { id }
})
