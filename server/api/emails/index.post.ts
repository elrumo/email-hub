import { cloneBlankEmailDocument, cloneEmailTemplateDocument } from '#shared/email/templates'
import type { EmailDocument } from '#shared/email/blocks'
import { countProjectsForOwner, createProject } from '../../utils/parse'
import { requireUser } from '../../utils/auth'
import { planFor } from '../../utils/plans'
import { projectSummary, reconcileVariables, requireOwnedContainer, requireOwnedFolder } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    name?: string
    templateId?: string
    projectId?: string
    folderId?: string
  }>(event)

  const n = await countProjectsForOwner(user.id)
  const limit = planFor(user.plan).limits.projects
  if (n >= limit) {
    throw createError({
      statusCode: 402,
      statusMessage: `You've reached your plan's limit of ${limit} projects. Upgrade to create more.`
    })
  }

  let projectId: string | null = null
  let folderId: string | null = null
  if (body.projectId) {
    projectId = (await requireOwnedContainer(body.projectId, user.id)).id
    if (body.folderId) {
      const folder = await requireOwnedFolder(body.folderId, user.id)
      if (folder.projectId !== projectId) {
        throw createError({ statusCode: 422, statusMessage: 'Folder belongs to a different project.' })
      }
      folderId = folder.id
    }
  }

  const doc: EmailDocument = (body.templateId && cloneEmailTemplateDocument(body.templateId)) || cloneBlankEmailDocument()
  const now = Date.now()
  const row = await createProject({
    ownerId: user.id,
    name: (body.name ?? '').trim() || doc.settings.title || 'Untitled email',
    document: doc,
    variables: reconcileVariables(doc, []),
    projectId,
    folderId,
    shareToken: null,
    shareMode: null,
    lastActorId: null,
    createdAt: now,
    updatedAt: now
  })

  return { project: projectSummary(row) }
})
