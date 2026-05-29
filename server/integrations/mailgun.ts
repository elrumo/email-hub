import { eq } from 'drizzle-orm'
import type { EmailDocument } from '#shared/email/blocks'
import { applyTemplateVariables } from '#shared/email/placeholders'
import { renderEmailHtml } from '#shared/email/render'
import { getDb } from '../db'
import { emailProjects } from '../db/schema'
import type { Integration } from '../engine/types'

/**
 * Mailgun (email). The connection holds an API key + sending domain + region;
 * the send action takes to/subject/body. Uses the v3 messages endpoint with
 * HTTP Basic auth ("api:<key>").
 */
function baseUrl(config: Record<string, unknown>): string {
  const region = String(config.region ?? 'us')
  return region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net'
}
function authHeader(apiKey: string): string {
  return 'Basic ' + Buffer.from(`api:${apiKey}`).toString('base64')
}

function normalizeVariables(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!key.trim()) continue
    out[key] = value == null ? '' : String(value)
  }
  return out
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|table|h[1-6]|li)>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

async function buildTemplatedEmail(input: Record<string, unknown>): Promise<{
  subject: string
  html: string
  text: string
  templateName: string
}> {
  const templateId = String(input.templateId ?? '').trim()
  if (!templateId) throw new Error('Choose an email template')

  const db = getDb()
  const rows = await db.select().from(emailProjects).where(eq(emailProjects.id, templateId))
  const project = rows[0]
  if (!project) throw new Error('Selected email template was not found')

  const templateDoc = project.document as unknown as EmailDocument
  const hydratedDoc = applyTemplateVariables(templateDoc, normalizeVariables(input.templateVariables))
  const subject = String(input.subject ?? '').trim() || hydratedDoc.settings.title || project.name
  if (!subject.trim()) throw new Error('Template emails need a subject')

  const html = renderEmailHtml(hydratedDoc)
  const text = htmlToPlainText(html)
  return { subject, html, text, templateName: project.name }
}

export const mailgunIntegration: Integration = {
  id: 'mailgun',
  name: 'Mailgun',
  img: 'https://www.mailgun.com/favicon.ico',
  connectionSchema: [
    { key: 'apiKey', label: 'API key', type: 'secret', required: true, help: 'Your Mailgun private API key.' },
    { key: 'domain', label: 'Sending domain', type: 'string', required: true, placeholder: 'mg.example.com' },
    { key: 'fromEmail', label: 'Default "from" address', type: 'string', required: true, placeholder: 'alerts@mg.example.com' },
    { key: 'region', label: 'Region', type: 'select', default: 'us', options: [
      { label: 'US', value: 'us' },
      { label: 'EU', value: 'eu' }
    ] }
  ],
  testConnection: async (config, signal) => {
    const apiKey = String(config.apiKey ?? '')
    const domain = String(config.domain ?? '')
    if (!apiKey || !domain) return { ok: false, message: 'API key and domain are required' }
    try {
      // cheap authed read: fetch the domain's record
      const res = await fetch(`${baseUrl(config)}/v4/domains/${encodeURIComponent(domain)}`, {
        headers: { Authorization: authHeader(apiKey) },
        signal
      })
      if (res.status === 401) return { ok: false, message: 'API key rejected (401)' }
      if (res.status === 404) return { ok: false, message: `Domain "${domain}" not found in this region` }
      if (!res.ok) return { ok: false, message: `Mailgun returned ${res.status}` }
      return { ok: true, message: `Connected — domain "${domain}" is reachable` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not reach Mailgun' }
    }
  },
  triggers: [],
  actions: [
    {
      id: 'sendEmail',
      name: 'Send an email',
      description: 'Sends an email through the connected Mailgun domain.',
      needsConnection: true,
      inputSchema: [
        { key: 'to', label: 'To', type: 'string', required: true, placeholder: 'you@example.com', help: 'Comma-separate multiple recipients.' },
        {
          key: 'contentMode',
          label: 'Content',
          type: 'select',
          default: 'plain',
          options: [
            { label: 'Plain text', value: 'plain' },
            { label: 'Email template', value: 'template' }
          ]
        },
        { key: 'subject', label: 'Subject', type: 'string', help: 'Leave blank in template mode to use the template subject.' },
        {
          key: 'text',
          label: 'Body (plain text)',
          type: 'string',
          required: true,
          help: 'Supports flow refs like {{ trigger.host }}.',
          showIf: { field: 'contentMode', in: ['plain'] }
        },
        {
          key: 'templateId',
          label: 'Email template',
          type: 'select',
          options: [],
          required: true,
          help: 'Pick one of your saved email projects.',
          showIf: { field: 'contentMode', in: ['template'] }
        },
        {
          key: 'templateVariables',
          label: 'Template variables',
          type: 'keyValue',
          help: 'Map template placeholders like {{ firstName }} to the text or flow refs you want to inject.',
          showIf: { field: 'contentMode', in: ['template'] }
        },
        { key: 'from', label: 'From (optional)', type: 'string', help: 'Overrides the connection default.' }
      ],
      outputKeys: ['sent', 'id'],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const apiKey = String(cfg.apiKey ?? '')
        const domain = String(cfg.domain ?? '')
        const mode = String(ctx.input.contentMode ?? 'plain')
        const usingTemplate = mode === 'template'
        const templated = usingTemplate ? await buildTemplatedEmail(ctx.input) : null
        const subject = usingTemplate
          ? templated!.subject
          : String(ctx.input.subject ?? '').trim()
        const text = usingTemplate
          ? templated!.text
          : String(ctx.input.text ?? '')

        if (!subject) throw new Error('Subject is required')
        if (!text.trim()) throw new Error(usingTemplate ? 'Rendered template body was empty' : 'Body is required')

        const form = new URLSearchParams()
        form.set('from', String(ctx.input.from ?? cfg.fromEmail ?? ''))
        form.set('to', String(ctx.input.to ?? ''))
        form.set('subject', subject)
        form.set('text', text)
        if (usingTemplate) form.set('html', templated!.html)
        const res = await fetch(`${baseUrl(cfg)}/v3/${encodeURIComponent(domain)}/messages`, {
          method: 'POST',
          headers: { 'Authorization': authHeader(apiKey), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
          signal: ctx.signal
        })
        const data = await res.json().catch(() => null) as { id?: string, message?: string } | null
        if (!res.ok) throw new Error(data?.message || `Mailgun send → ${res.status}`)
        ctx.log(usingTemplate
          ? `mailgun → ${ctx.input.to} using template "${templated!.templateName}" (${data?.id ?? 'queued'})`
          : `mailgun → ${ctx.input.to} (${data?.id ?? 'queued'})`)
        return { sent: true, id: data?.id ?? null }
      }
    }
  ]
}
