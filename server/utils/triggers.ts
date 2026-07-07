import type { EmailDocument } from '#shared/email/blocks'
import { applyTemplateVariables } from '#shared/email/placeholders'
import { renderEmailHtml } from '#shared/email/render'
import {
  getProject,
  getTriggerSetting,
  lastTriggerSendAt,
  listUsersInactiveSince,
  recordTriggerSend,
  type AppUser,
  type TemplateVariable
} from './parse'
import { sendMail } from './mailer'

/**
 * Lifecycle trigger emails. The admin maps each trigger to one of their email
 * templates on /app/admin; firing renders that template with the user's
 * details filled into its mustache variables and emails it to the user.
 */

export type TriggerKey = 'welcome' | 'purchase' | 'inactive'

export const TRIGGER_DEFS: Array<{ key: TriggerKey, label: string, description: string }> = [
  { key: 'welcome', label: 'Welcome email', description: 'Sent when a new user creates an account.' },
  { key: 'purchase', label: 'Purchase thank-you', description: 'Sent when a user upgrades to a paid plan.' },
  { key: 'inactive', label: 'Inactivity win-back', description: 'Sent when a user hasn’t logged in for the configured number of months.' }
]

function variablesForUser(user: AppUser): Record<string, string> {
  const name = user.name || user.email.split('@')[0] || 'there'
  return {
    email: user.email,
    name,
    firstName: name.split(/\s+/)[0] || name,
    plan: user.plan
  }
}

/**
 * Fire a trigger for a user. Silently does nothing when the trigger is
 * disabled or has no template; never throws (trigger emails must not break
 * signup/checkout flows).
 */
export async function fireTrigger(trigger: TriggerKey, user: AppUser): Promise<void> {
  try {
    const setting = await getTriggerSetting(trigger)
    if (!setting?.enabled || !setting.projectId) return

    const project = await getProject(setting.projectId)
    if (!project) return

    const vars: Record<string, string> = {}
    for (const v of project.variables as TemplateVariable[]) {
      if (v.defaultValue != null) vars[v.key] = v.defaultValue
    }
    Object.assign(vars, variablesForUser(user))

    const doc = applyTemplateVariables(project.document as EmailDocument, vars)
    const html = renderEmailHtml(doc)
    const subject = doc.settings.title || project.name

    await sendMail({ to: user.email, subject, html })
    await recordTriggerSend({ userId: user.id, trigger, projectId: project.id, sentAt: Date.now() })
  } catch (e) {
    console.error(`[triggers] failed to send "${trigger}" to ${user.email}:`, e instanceof Error ? e.message : e)
  }
}

/**
 * Send the inactivity email to every user past the configured threshold.
 * A user is emailed at most once per inactivity period: once sent, they only
 * qualify again after logging in and going inactive once more.
 */
export async function sweepInactiveUsers(): Promise<number> {
  const setting = await getTriggerSetting('inactive')
  if (!setting?.enabled || !setting.projectId) return 0

  const months = setting.inactiveAfterMonths ?? 3
  const cutoff = Date.now() - months * 30 * 24 * 60 * 60 * 1000
  const candidates = await listUsersInactiveSince(cutoff)

  let sent = 0
  for (const user of candidates) {
    const lastSent = await lastTriggerSendAt(user.id, 'inactive')
    const lastActive = user.lastLoginAt ?? user.createdAt
    if (lastSent >= lastActive) continue // already nudged this inactivity period
    await fireTrigger('inactive', user)
    sent += 1
  }
  return sent
}
