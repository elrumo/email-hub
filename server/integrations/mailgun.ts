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
        { key: 'subject', label: 'Subject', type: 'string', required: true },
        { key: 'text', label: 'Body (plain text)', type: 'string', required: true },
        { key: 'from', label: 'From (optional)', type: 'string', help: 'Overrides the connection default.' }
      ],
      outputKeys: ['sent', 'id'],
      run: async (ctx) => {
        const cfg = ctx.connection!.config
        const apiKey = String(cfg.apiKey ?? '')
        const domain = String(cfg.domain ?? '')
        const form = new URLSearchParams()
        form.set('from', String(ctx.input.from ?? cfg.fromEmail ?? ''))
        form.set('to', String(ctx.input.to ?? ''))
        form.set('subject', String(ctx.input.subject ?? ''))
        form.set('text', String(ctx.input.text ?? ''))
        const res = await fetch(`${baseUrl(cfg)}/v3/${encodeURIComponent(domain)}/messages`, {
          method: 'POST',
          headers: { 'Authorization': authHeader(apiKey), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
          signal: ctx.signal
        })
        const data = await res.json().catch(() => null) as { id?: string, message?: string } | null
        if (!res.ok) throw new Error(data?.message || `Mailgun send → ${res.status}`)
        ctx.log(`mailgun → ${ctx.input.to} (${data?.id ?? 'queued'})`)
        return { sent: true, id: data?.id ?? null }
      }
    }
  ]
}
