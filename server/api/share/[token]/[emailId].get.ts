import type { EmailDocument } from '#shared/email/blocks'
import { applyTemplateVariables } from '#shared/email/placeholders'
import { renderEmailHtml } from '#shared/email/render'
import { getProject, type TemplateVariable } from '../../../utils/parse'
import { resolveShareToken } from '../../../utils/access'

/** Rendered HTML for one email inside a shared project. */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const emailId = getRouterParam(event, 'emailId')!

  const resolved = await resolveShareToken(token)
  if (resolved?.type !== 'project') {
    throw createError({ statusCode: 404, statusMessage: 'This share link is no longer active.' })
  }

  const email = await getProject(emailId)
  if (!email || email.projectId !== resolved.container.id) {
    throw createError({ statusCode: 404, statusMessage: 'Email not found in this shared project.' })
  }

  const vars: Record<string, string> = {}
  for (const v of (email.variables ?? []) as TemplateVariable[]) {
    if (v.defaultValue != null) vars[v.key] = v.defaultValue
  }
  return {
    id: email.id,
    name: email.name,
    subject: (email.document as EmailDocument).settings.title,
    html: renderEmailHtml(applyTemplateVariables(email.document as EmailDocument, vars))
  }
})
