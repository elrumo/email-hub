import { createFolder } from '../../utils/parse'
import { requireUser } from '../../utils/auth'
import { requireOwnedContainer, requireOwnedFolder } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ projectId?: string, parentId?: string | null, name?: string }>(event)

  const name = (body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'Give the folder a name.' })
  if (!body.projectId) throw createError({ statusCode: 422, statusMessage: 'projectId is required.' })

  await requireOwnedContainer(body.projectId, user.id)
  if (body.parentId) {
    const parent = await requireOwnedFolder(body.parentId, user.id)
    if (parent.projectId !== body.projectId) {
      throw createError({ statusCode: 422, statusMessage: 'Parent folder belongs to a different project.' })
    }
  }

  const now = Date.now()
  const folder = await createFolder({
    ownerId: user.id,
    projectId: body.projectId,
    parentId: body.parentId ?? null,
    name,
    createdAt: now,
    updatedAt: now
  })
  return { folder }
})
