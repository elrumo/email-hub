import { EMAIL_TEMPLATES } from '#shared/email/templates'

export default defineEventHandler(() => {
  return {
    templates: EMAIL_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      style: t.style,
      icon: t.icon,
      accent: t.accent,
      description: t.description,
      document: t.document
    }))
  }
})
