import type { EmailDocument } from '#shared/email/blocks'
import { renderEmailHtml } from '#shared/email/render'
import { applyTemplateVariables } from '#shared/email/placeholders'
import { requireEmailAccess } from '../../../utils/access'
import { isMailerConfigured, sendMail } from '../../../utils/mailer'
import { assertRateLimit } from '../../../utils/rateLimit'

/**
 * Send a test render of this email to the signed-in user (or an address they
 * provide). Sample variable values are substituted so the test reads like the
 * real thing. Degrades gracefully when SMTP isn't configured.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { email, user } = await requireEmailAccess(event, id, 'edit')
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to send test emails.' })
  }
  assertRateLimit(event, 'send-test', {
    limit: 5,
    windowMs: 60_000,
    key: user.id,
    message: 'Too many test sends — wait a minute and try again.'
  })

  const body = await readBody<{ to?: string, document?: EmailDocument }>(event).catch(() => ({} as { to?: string, document?: EmailDocument }))
  const to = (body.to ?? '').trim() || user.email
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    throw createError({ statusCode: 422, statusMessage: 'Enter a valid recipient email address.' })
  }

  // Prefer the document the editor holds right now (autosave may lag a beat).
  const doc = (body.document ?? email.document) as EmailDocument
  const vars: Record<string, string> = {}
  for (const v of email.variables ?? []) {
    if (v.defaultValue != null) vars[v.key] = v.defaultValue
  }
  const rendered = Object.keys(vars).length ? applyTemplateVariables(doc, vars) : doc

  const subject = (rendered.settings?.title ?? '').trim() || email.name || 'Untitled email'
  const delivered = await sendMail({
    to,
    subject: `[Test] ${subject}`,
    html: renderEmailHtml(rendered)
  })

  return {
    delivered,
    to,
    configured: isMailerConfigured()
  }
})
