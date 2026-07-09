/**
 * Accept an uploaded HTML email file and create a new email project from it.
 * The HTML is stored as a single `html` block so the AI can edit it further.
 */
import { emptyDocument, type EmailDocument } from '#shared/email/blocks'
import { countProjectsForOwner, createProject } from '../../utils/parse'
import { requireUser } from '../../utils/auth'
import { planFor } from '../../utils/plans'
import { projectSummary, reconcileVariables, requireOwnedContainer, requireOwnedFolder } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const formData = await readMultipartFormData(event)
  if (!formData?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded.' })
  }

  const file = formData.find(f => f.name === 'file')
  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file field.' })
  }

  const html = file.data.toString('utf-8')
  if (!html.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'The uploaded file is empty.' })
  }

  const projectIdField = formData.find(f => f.name === 'projectId')
  const folderIdField = formData.find(f => f.name === 'folderId')
  const projectId = projectIdField?.data?.toString() || undefined
  const folderId = folderIdField?.data?.toString() || undefined

  const n = await countProjectsForOwner(user.id)
  const limit = planFor(user.plan).limits.projects
  if (n >= limit) {
    throw createError({
      statusCode: 402,
      statusMessage: `You've reached your plan's limit of ${limit} projects. Upgrade to create more.`
    })
  }

  let resolvedProjectId: string | null = null
  let resolvedFolderId: string | null = null
  if (projectId) {
    resolvedProjectId = (await requireOwnedContainer(projectId, user.id)).id
    if (folderId) {
      const folder = await requireOwnedFolder(folderId, user.id)
      if (folder.projectId !== resolvedProjectId) {
        throw createError({ statusCode: 422, statusMessage: 'Folder belongs to a different project.' })
      }
      resolvedFolderId = folder.id
    }
  }

  // Build a minimal EmailDocument with the uploaded HTML as a single block.
  const doc: EmailDocument = emptyDocument()
  doc.settings.title = file.filename?.replace(/\.html?$/i, '') || 'Uploaded email'
  doc.blocks = [
    {
      id: `blk_${Math.random().toString(36).slice(2, 9)}`,
      type: 'html',
      html,
      padding: 0
    }
  ]

  const row = await createProject({
    ownerId: user.id,
    name: doc.settings.title,
    document: doc,
    variables: reconcileVariables(doc, []),
    projectId: resolvedProjectId,
    folderId: resolvedFolderId,
    shareToken: null,
    shareMode: null,
    lastActorId: null
  })

  return { project: projectSummary(row) }
})
