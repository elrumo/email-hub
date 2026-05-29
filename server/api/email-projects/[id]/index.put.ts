import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { emailProjects } from '../../../db/schema'

/** Update a project's name and/or document (autosave from the editor). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const db = getDb()
  const rows = await db.select().from(emailProjects).where(eq(emailProjects.id, id))
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'email project not found' })

  const update: Record<string, unknown> = { updatedAt: Date.now() }
  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
    update.name = name
  }
  if (body?.document !== undefined) {
    if (typeof body.document !== 'object' || body.document === null || !Array.isArray(body.document.blocks)) {
      throw createError({ statusCode: 400, statusMessage: 'document must have a blocks array' })
    }
    update.document = body.document
  }

  await db.update(emailProjects).set(update).where(eq(emailProjects.id, id))
  return { id, updated: true }
})
