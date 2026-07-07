import type { EmailDocument } from '#shared/email/blocks'
import type { TemplateVariable } from '../../../utils/parse'
import { updateProject } from '../../../utils/parse'
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

  const document = body.document ?? project.document
  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') patch.name = body.name.trim() || project.name
  if (body.document) patch.document = body.document
  patch.variables = reconcileVariables(document, body.variables ?? project.variables)

  const row = await updateProject(id, patch)
  return { project: projectSummary(row) }
})
