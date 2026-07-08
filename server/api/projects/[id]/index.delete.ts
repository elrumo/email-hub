import {
  deleteChatMessages,
  deleteContainer,
  deleteEmailVersions,
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
  // Emails are independent of each other — clean them up in bounded batches
  // instead of 3 sequential round-trips per email (large projects would
  // otherwise push this request into client timeouts).
  const BATCH = 10
  for (let i = 0; i < emails.length; i += BATCH) {
    await Promise.all(emails.slice(i, i + BATCH).map(email =>
      Promise.all([deleteChatMessages(email.id), deleteEmailVersions(email.id)])
        .then(() => deleteProject(email.id))
    ))
  }
  await Promise.all(folders.map(folder => deleteFolder(folder.id)))
  await deleteContainer(id)
  return { ok: true }
})
