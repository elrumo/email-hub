import { cloneBlankEmailDocument, cloneEmailTemplateDocument } from '#shared/email/templates'
import type { EmailDocument } from '#shared/email/blocks'
import { countProjectsForOwner, createProject, getUserTemplate } from '../../utils/parse'
import { requireUser } from '../../utils/auth'
import { planFor } from '../../utils/plans'
import { projectSummary, reconcileVariables, requireOwnedContainer, requireOwnedFolder } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    name?: string
    templateId?: string
    /** id of one of the user's saved templates (takes precedence over templateId) */
    userTemplateId?: string
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

  let doc: EmailDocument | null = null
  let templateName: string | null = null
  if (body.userTemplateId) {
    const saved = await getUserTemplate(body.userTemplateId)
    if (!saved || saved.ownerId !== user.id) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }
    doc = structuredClone(saved.document)
    templateName = saved.name
  }
  if (!doc) doc = (body.templateId && cloneEmailTemplateDocument(body.templateId)) || cloneBlankEmailDocument()
  const row = await createProject({
    ownerId: user.id,
    name: (body.name ?? '').trim() || templateName || doc.settings.title || 'Untitled email',
    document: doc,
    variables: reconcileVariables(doc, []),
    projectId,
    folderId,
    shareToken: null,
    shareMode: null,
    lastActorId: null
  })

  return { project: projectSummary(row) }
})
