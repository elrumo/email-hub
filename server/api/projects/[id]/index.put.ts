import { updateContainer } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { normalizeDescription, normalizeTags, requireOwnedContainer } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  await requireOwnedContainer(id, user.id)

  const body = await readBody<{ name?: string, description?: string, tags?: string[] }>(event)
  const name = (body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'Give the project a name.' })

  const patch: Record<string, unknown> = { name }
  const description = normalizeDescription(body.description)
  if (description !== undefined) patch.description = description
  const tags = normalizeTags(body.tags)
  if (tags !== null) patch.tags = tags

  const project = await updateContainer(id, patch)
  return { project }
})
