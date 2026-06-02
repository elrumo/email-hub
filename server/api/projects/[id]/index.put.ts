import { eq } from 'drizzle-orm'
import type { EmailDocument } from '#shared/email/blocks'
import { getDb } from '../../../db'
import { emailProjects, type TemplateVariable } from '../../../db/schema'
import { requireUser } from '../../../utils/auth'
import { projectSummary, reconcileVariables, requireOwnedProject } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const project = await requireOwnedProject(id, user.id)
  const body = await readBody<{
    name?: string
    document?: EmailDocument
    variables?: TemplateVariable[]
  }>(event)

  const document = body.document ?? (project.document as EmailDocument)
  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  if (typeof body.name === 'string') patch.name = body.name.trim() || project.name
  if (body.document) patch.document = body.document
  // Variables always tracked against the (possibly new) document.
  patch.variables = reconcileVariables(document, body.variables ?? (project.variables as TemplateVariable[]))

  const [row] = await getDb()
    .update(emailProjects)
    .set(patch)
    .where(eq(emailProjects.id, id))
    .returning()

  return { project: projectSummary(row!) }
})
