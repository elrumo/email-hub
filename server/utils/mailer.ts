import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Outgoing mail. Prefers Mailgun's HTTP API when MAILGUN_API_KEY + MAILGUN_DOMAIN
 * are set, otherwise falls back to SMTP (NUXT_MAIL_* env). When neither is
 * configured, sends are logged to the console instead of failing — so trigger
 * emails and the send API degrade gracefully in development.
 */

export interface OutgoingMail {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
}

function mailgunConfig() {
  const apiKey = process.env.MAILGUN_API_KEY
  const domain = process.env.MAILGUN_DOMAIN
  if (!apiKey || !domain) return null
  const base = (process.env.MAILGUN_API_BASE_URL || 'https://api.mailgun.net/v3').replace(/\/$/, '')
  return { apiKey, domain, base, from: process.env.MAILGUN_FROM_EMAIL }
}

let transporter: Transporter | null | undefined

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter
  const cfg = useRuntimeConfig().mail
  if (!cfg.smtpHost) {
    transporter = null
    return transporter
  }
  transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: Number(cfg.smtpPort) || 587,
    secure: cfg.smtpSecure === '1' || Number(cfg.smtpPort) === 465,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined
  })
  return transporter
}

export function isMailerConfigured(): boolean {
  return !!mailgunConfig() || !!useRuntimeConfig().mail.smtpHost
}

async function sendViaMailgun(mail: OutgoingMail, mg: NonNullable<ReturnType<typeof mailgunConfig>>, from: string) {
  const body = new URLSearchParams({ from, to: mail.to, subject: mail.subject, html: mail.html })
  if (mail.text) body.set('text', mail.text)
  await $fetch(`${mg.base}/${mg.domain}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`api:${mg.apiKey}`).toString('base64')}` },
    body
  })
}

/**
 * Send an email. Returns true when handed to Mailgun/SMTP, false when only
 * logged (nothing configured). Throws on transport errors.
 */
export async function sendMail(mail: OutgoingMail): Promise<boolean> {
  const cfg = useRuntimeConfig().mail
  const mg = mailgunConfig()
  const from = mail.from || mg?.from || cfg.from || 'Postcard <no-reply@localhost>'

  if (mg) {
    await sendViaMailgun(mail, mg, from)
    return true
  }

  const transport = getTransporter()
  if (!transport) {
    console.info(`[mailer] SMTP not configured — would send "${mail.subject}" to ${mail.to}`)
    return false
  }

  await transport.sendMail({
    from,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text
  })
  return true
}
