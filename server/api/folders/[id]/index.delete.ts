import { deleteFolder, listEmailsInContainer, listFolders, updateFolder, updateProject } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedFolder } from '../../../utils/projects'

/**
 * Delete a folder. Its contents are not lost: child folders and emails move
 * up to the deleted folder's parent (or the project root).
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const folder = await requireOwnedFolder(id, user.id)

  const [siblings, emails] = await Promise.all([
    listFolders(folder.projectId),
    listEmailsInContainer(folder.projectId)
  ])

  for (const child of siblings.filter(f => f.parentId === id)) {
    await updateFolder(child.id, { parentId: folder.parentId ?? null })
  }
  for (const email of emails.filter(e => e.folderId === id)) {
    await updateProject(email.id, { folderId: folder.parentId ?? null })
  }

  await deleteFolder(id)
  return { ok: true }
})
