import { createContainer } from '../../utils/parse'
import { requireUser } from '../../utils/auth'
import { normalizeDescription, normalizeTags } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ name?: string, description?: string, tags?: string[] }>(event)
  const name = (body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'Give the project a name.' })

  const now = Date.now()
  const project = await createContainer({
    ownerId: user.id,
    name,
    description: normalizeDescription(body.description) ?? null,
    tags: normalizeTags(body.tags) ?? [],
    memberIds: [],
    shareToken: null,
    shareMode: null,
    createdAt: now,
    updatedAt: now
  })
  return { project }
})
