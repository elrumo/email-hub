import type { EmailDocument } from '#shared/email/blocks'
import { applyTemplateVariables } from '#shared/email/placeholders'
import { renderEmailHtml } from '#shared/email/render'
import type { TemplateVariable } from '../../../../utils/parse'
import { requireApiUser } from '../../../../utils/apiKey'
import { requireOwnedProject } from '../../../../utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireApiUser(event)
  const id = getRouterParam(event, 'id')!
  const project = await requireOwnedProject(id, user.id)

  const query = getQuery(event)
  const format = String(query.format ?? 'json')
  const declared = project.variables as TemplateVariable[]
  const vars: Record<string, string> = {}
  for (const v of declared) {
    if (v.defaultValue != null) vars[v.key] = v.defaultValue
  }
  for (const [key, value] of Object.entries(query)) {
    if (key === 'format') continue
    vars[key] = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
  }

  const doc = applyTemplateVariables(project.document as EmailDocument, vars)
  const html = renderEmailHtml(doc)

  if (format === 'html') {
    setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
    return html
  }

  return {
    id: project.id,
    name: project.name,
    subject: (project.document as EmailDocument).settings.title,
    html
  }
})
