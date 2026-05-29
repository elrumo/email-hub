import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { shortcuts } from '../../db/schema'
import { requireUser } from '../../utils/auth'
import { normalizeShortcutBody } from './_shared'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  const fields = normalizeShortcutBody(body, {})

  const db = getDb()
  const now = Date.now()
  const id = randomUUID()
  await db.insert(shortcuts).values({
    id,
    ownerId: user.id,
    ...fields,
    createdAt: now,
    updatedAt: now
  })

  setResponseStatus(event, 201)
  return { id }
})
