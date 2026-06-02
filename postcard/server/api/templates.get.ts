import { EMAIL_TEMPLATES } from '#shared/email/templates'

export default defineEventHandler(() => {
  // Send catalogue metadata only (not full documents) for the picker.
  return {
    templates: EMAIL_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      style: t.style,
      icon: t.icon,
      accent: t.accent,
      description: t.description
    }))
  }
})
