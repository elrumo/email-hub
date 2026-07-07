import { getFolder, updateFolder } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedFolder } from '../../../utils/projects'

/** Rename a folder and/or move it under another folder in the same project. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const folder = await requireOwnedFolder(id, user.id)

  const body = await readBody<{ name?: string, parentId?: string | null }>(event)
  const patch: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) throw createError({ statusCode: 422, statusMessage: 'Give the folder a name.' })
    patch.name = name
  }

  if (body.parentId !== undefined) {
    const parentId = body.parentId || null
    if (parentId === id) throw createError({ statusCode: 422, statusMessage: 'A folder cannot contain itself.' })
    if (parentId) {
      const parent = await requireOwnedFolder(parentId, user.id)
      if (parent.projectId !== folder.projectId) {
        throw createError({ statusCode: 422, statusMessage: 'Folders can only move within their project.' })
      }
      // Walk up from the new parent — moving under a descendant would loop.
      let cursor: string | null = parent.parentId
      while (cursor) {
        if (cursor === id) throw createError({ statusCode: 422, statusMessage: 'A folder cannot move inside its own subfolder.' })
        cursor = (await getFolder(cursor))?.parentId ?? null
      }
    }
    patch.parentId = parentId
  }

  const updated = await updateFolder(id, patch)
  return { folder: updated }
})
