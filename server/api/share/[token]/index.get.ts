import type { EmailDocument } from '#shared/email/blocks'
import { applyTemplateVariables } from '#shared/email/placeholders'
import { renderEmailHtml } from '#shared/email/render'
import { listEmailsInContainer, type EmailProject, type TemplateVariable } from '../../../utils/parse'
import { getSessionUser } from '../../../utils/auth'
import { resolveShareToken } from '../../../utils/access'

function renderShared(email: EmailProject): string {
  const vars: Record<string, string> = {}
  for (const v of (email.variables ?? []) as TemplateVariable[]) {
    if (v.defaultValue != null) vars[v.key] = v.defaultValue
  }
  return renderEmailHtml(applyTemplateVariables(email.document as EmailDocument, vars))
}

/**
 * Public share resolution. Returns a rendered preview for a shared email, or
 * the email list for a shared project. No auth required for 'view'; the
 * response says whether the current visitor could edit.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const resolved = await resolveShareToken(token)
  if (!resolved) throw createError({ statusCode: 404, statusMessage: 'This share link is no longer active.' })

  const user = await getSessionUser(event)

  if (resolved.type === 'email') {
    const { email } = resolved
    const canEdit = email.shareMode === 'edit' && !!user
    return {
      type: 'email' as const,
      name: email.name,
      subject: (email.document as EmailDocument).settings.title,
      html: renderShared(email),
      canEdit,
      editUrl: canEdit ? `/app/emails/${email.id}?share=${token}` : null,
      signInToEdit: email.shareMode === 'edit' && !user
    }
  }

  const { container } = resolved
  const emails = await listEmailsInContainer(container.id)
  const canEdit = container.shareMode === 'edit' && !!user
  return {
    type: 'project' as const,
    name: container.name,
    canEdit,
    signInToEdit: container.shareMode === 'edit' && !user,
    emails: emails.map(e => ({
      id: e.id,
      name: e.name,
      subject: (e.document as EmailDocument).settings.title,
      editUrl: canEdit ? `/app/emails/${e.id}?share=${token}` : null
    }))
  }
})
