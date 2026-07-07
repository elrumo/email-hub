import {
  deleteChatMessages,
  deleteContainer,
  deleteFolder,
  deleteProject,
  listEmailsInContainer,
  listFolders
} from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedContainer } from '../../../utils/projects'

/** Delete a project and everything in it: folders, emails and their chats. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  await requireOwnedContainer(id, user.id)

  const [folders, emails] = await Promise.all([listFolders(id), listEmailsInContainer(id)])
  for (const email of emails) {
    await deleteChatMessages(email.id)
    await deleteProject(email.id)
  }
  for (const folder of folders) {
    await deleteFolder(folder.id)
  }
  await deleteContainer(id)
  return { ok: true }
})
