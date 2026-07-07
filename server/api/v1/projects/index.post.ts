import { cloneBlankEmailDocument, cloneEmailTemplateDocument } from '#shared/email/templates'
import type { EmailDocument } from '#shared/email/blocks'
import { countProjectsForOwner, createProject } from '../../../utils/parse'
import { requireApiUser } from '../../../utils/apiKey'
import { generateEmailDocument } from '../../../utils/aiGenerate'
import { planFor } from '../../../utils/plans'
import { projectSummary, reconcileVariables } from '../../../utils/projects'

/**
 * Create an email project over the API — from a predefined template, from an
 * AI prompt (the assistant designs the whole email), or blank.
 */
export default defineEventHandler(async (event) => {
  const user = await requireApiUser(event)
  const body = await readBody<{ name?: string, templateId?: string, prompt?: string }>(event)

  const n = await countProjectsForOwner(user.id)
  const limit = planFor(user.plan).limits.projects
  if (n >= limit) {
    throw createError({
      statusCode: 402,
      statusMessage: `You've reached your plan's limit of ${limit} projects. Upgrade to create more.`
    })
  }

  const prompt = (body.prompt ?? '').trim()
  let doc: EmailDocument
  if (prompt) {
    doc = await generateEmailDocument(user, prompt)
  } else {
    doc = (body.templateId && cloneEmailTemplateDocument(body.templateId)) || cloneBlankEmailDocument()
  }

  const now = Date.now()
  const row = await createProject({
    ownerId: user.id,
    name: (body.name ?? '').trim() || doc.settings.title || 'Untitled email',
    document: doc,
    variables: reconcileVariables(doc, []),
    projectId: null,
    folderId: null,
    shareToken: null,
    shareMode: null,
    lastActorId: null,
    createdAt: now,
    updatedAt: now
  })

  setResponseStatus(event, 201)
  return projectSummary(row)
})
