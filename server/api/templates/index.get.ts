import { EMAIL_TEMPLATES } from '#shared/email/templates'
import { listUserTemplates } from '../../utils/parse'
import { getSessionUser } from '../../utils/auth'

/**
 * The template catalogue: built-in starters (metadata only — their documents
 * ship with the client bundle) plus the signed-in user's saved templates.
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)
  const mine = user ? await listUserTemplates(user.id) : []

  return {
    templates: EMAIL_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      style: t.style,
      icon: t.icon,
      accent: t.accent,
      description: t.description
    })),
    userTemplates: mine.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      updatedAt: t.updatedAt
    }))
  }
})
