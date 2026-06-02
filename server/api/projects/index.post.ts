import { randomUUID } from 'node:crypto'
import { count, eq } from 'drizzle-orm'
import { cloneBlankEmailDocument, cloneEmailTemplateDocument } from '#shared/email/templates'
import type { EmailDocument } from '#shared/email/blocks'
import { getDb } from '../../db'
import { emailProjects } from '../../db/schema'
import { requireUser } from '../../utils/auth'
import { planFor } from '../../utils/plans'
import { projectSummary, reconcileVariables } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ name?: string, templateId?: string }>(event)

  const db = getDb()
  const countRows = await db.select({ n: count() }).from(emailProjects).where(eq(emailProjects.ownerId, user.id))
  const n = countRows[0]?.n ?? 0
  const limit = planFor(user.plan).limits.projects
  if (n >= limit) {
    throw createError({
      statusCode: 402,
      statusMessage: `You've reached your plan's limit of ${limit} projects. Upgrade to create more.`
    })
  }

  const doc: EmailDocument = (body.templateId && cloneEmailTemplateDocument(body.templateId)) || cloneBlankEmailDocument()
  const now = Date.now()
  const [row] = await db.insert(emailProjects).values({
    id: randomUUID(),
    ownerId: user.id,
    name: (body.name ?? '').trim() || doc.settings.title || 'Untitled email',
    document: doc,
    variables: reconcileVariables(doc, []),
    createdAt: now,
    updatedAt: now
  }).returning()

  return { project: projectSummary(row!) }
})
