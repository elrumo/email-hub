import { createContainer, listContainers, listProjects, updateProject } from '../../utils/parse'
import { requireUser } from '../../utils/auth'

/**
 * List the user's projects (the top-level containers). Legacy emails created
 * before projects existed are adopted into a default "My emails" project on
 * first load, so nothing ever looks lost.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  let [containers, emails] = await Promise.all([
    listContainers(user.id),
    listProjects(user.id)
  ])

  const orphans = emails.filter(e => !e.projectId)
  if (orphans.length) {
    let home = containers.find(c => c.name === 'My emails')
    if (!home) {
      const now = Date.now()
      home = await createContainer({ ownerId: user.id, name: 'My emails', memberIds: [], shareToken: null, shareMode: null, createdAt: now, updatedAt: now })
      containers = [home, ...containers]
    }
    for (const orphan of orphans) {
      await updateProject(orphan.id, { projectId: home.id, folderId: null })
    }
    emails = emails.map(e => (e.projectId ? e : { ...e, projectId: home!.id }))
  }

  const counts = new Map<string, number>()
  for (const e of emails) {
    if (e.projectId) counts.set(e.projectId, (counts.get(e.projectId) ?? 0) + 1)
  }

  return {
    projects: containers.map(c => ({
      id: c.id,
      name: c.name,
      emails: counts.get(c.id) ?? 0,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt
    }))
  }
})
