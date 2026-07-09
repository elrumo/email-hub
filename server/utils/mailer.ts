import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Outgoing mail. Configured via NUXT_MAIL_* env (SMTP). When no SMTP host is
 * set, sends are logged to the console instead of failing — so trigger emails
 * and the send API degrade gracefully in development.
 */

/** Pragmatic address check shared by signup, test sends and the send API. */
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export interface OutgoingMail {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
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
  return !!useRuntimeConfig().mail.smtpHost
}

/**
 * Send an email. Returns true when handed to SMTP, false when only logged
 * (no SMTP configured). Throws on SMTP transport errors.
 */
export async function sendMail(mail: OutgoingMail): Promise<boolean> {
  const cfg = useRuntimeConfig().mail
  const from = mail.from || cfg.from || 'Postcard <no-reply@localhost>'
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
