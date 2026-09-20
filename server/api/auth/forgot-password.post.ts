import { findUserByEmail, updateUser } from '../../utils/parse'
import { generateResetToken, hashToken, RESET_TTL_MS } from '../../utils/auth'
import { sendMail } from '../../utils/mailer'

/**
 * Start a password reset. Always responds with the same generic message
 * regardless of whether the email is registered — this prevents attackers from
 * using the endpoint to discover which addresses have accounts.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string }>(event)
  const email = (body.email ?? '').trim().toLowerCase()

  const generic = { ok: true, message: 'If that email has an account, a reset link is on its way.' }

  const user = await findUserByEmail(email)
  if (!user) return generic

  const token = generateResetToken()
  await updateUser(user.id, {
    resetTokenHash: hashToken(token),
    resetTokenExpiresAt: Date.now() + RESET_TTL_MS
  })

  const appUrl = useRuntimeConfig().public.appUrl || getRequestURL(event).origin
  const link = `${appUrl.replace(/\/$/, '')}/reset-password?token=${token}`
  const appName = useRuntimeConfig().public.appName || 'Postcard'

  // Never leak SMTP failures back to the caller — that would reveal the account exists.
  try {
    await sendMail({
      to: user.email,
      subject: `Reset your ${appName} password`,
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111">
        <p>Hi ${user.name || 'there'},</p>
        <p>We received a request to reset your ${appName} password. Click the button below to choose a new one. This link expires in one hour.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Reset password</a>
        </p>
        <p>Or paste this link into your browser:<br><a href="${link}">${link}</a></p>
        <p style="color:#666">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      </div>`,
      text: `Reset your ${appName} password using this link (valid for one hour): ${link}\n\nIf you didn't request this, ignore this email.`
    })
  } catch (e) {
    console.error(`[forgot-password] failed to send reset email to ${user.email}:`, e instanceof Error ? e.message : e)
  }

  return generic
})
