import type { EmailDocument } from '#shared/email/blocks'
import { applyTemplateVariables } from '#shared/email/placeholders'
import { renderEmailHtml } from '#shared/email/render'
import type { TemplateVariable } from '../../utils/parse'
import { requireApiUser } from '../../utils/apiKey'
import { requireOwnedProject } from '../../utils/projects'
import { isMailerConfigured, sendMail } from '../../utils/mailer'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MAX_RECIPIENTS = 50

/**
 * Send an email over the API — either raw HTML supplied in the request, or
 * one of the caller's stored templates rendered with variable substitution.
 */
export default defineEventHandler(async (event) => {
  const user = await requireApiUser(event)
  const body = await readBody<{
    to?: string | string[]
    subject?: string
    html?: string
    text?: string
    projectId?: string
    variables?: Record<string, string>
  }>(event)

  const to = (Array.isArray(body.to) ? body.to : [body.to ?? '']).map(s => String(s).trim()).filter(Boolean)
  if (!to.length) {
    throw createError({ statusCode: 422, statusMessage: 'Provide at least one recipient in "to".' })
  }
  if (to.length > MAX_RECIPIENTS) {
    throw createError({ statusCode: 422, statusMessage: `At most ${MAX_RECIPIENTS} recipients per request.` })
  }
  const invalid = to.find(addr => !EMAIL_RE.test(addr))
  if (invalid) {
    throw createError({ statusCode: 422, statusMessage: `"${invalid}" is not a valid email address.` })
  }

  if (!isMailerConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Email sending is not configured on this server (set the NUXT_MAIL_* environment variables).'
    })
  }

  let subject = (body.subject ?? '').trim()
  let html = body.html ?? ''

  if (body.projectId) {
    const project = await requireOwnedProject(body.projectId, user.id)
    const vars: Record<string, string> = {}
    for (const v of project.variables as TemplateVariable[]) {
      if (v.defaultValue != null) vars[v.key] = v.defaultValue
    }
    Object.assign(vars, body.variables ?? {})
    const doc = applyTemplateVariables(project.document as EmailDocument, vars)
    html = renderEmailHtml(doc)
    subject = subject || doc.settings.title || project.name
  } else if (!html.trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Provide either "projectId" or raw "html" to send.' })
  }

  if (!subject) {
    throw createError({ statusCode: 422, statusMessage: 'Provide a "subject" when sending raw HTML.' })
  }

  const results = await Promise.allSettled(
    to.map(addr => sendMail({ to: addr, subject, html, text: body.text }))
  )
  const failed = to.filter((_, i) => results[i]?.status === 'rejected')
  if (failed.length === to.length) {
    throw createError({ statusCode: 502, statusMessage: 'Sending failed for every recipient.' })
  }

  return {
    sent: to.length - failed.length,
    failed,
    subject
  }
})
