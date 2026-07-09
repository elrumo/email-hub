import type { EmailDocument } from '#shared/email/blocks'
import { createUserTemplate, listUserTemplates } from '../../utils/parse'
import { requireUser } from '../../utils/auth'

const MAX_TEMPLATES_PER_USER = 100

/** Save the given document as a reusable personal template. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ name?: string, description?: string, document?: EmailDocument }>(event)

  const name = (body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'Give the template a name.' })
  const document = body.document
  if (!document || !Array.isArray(document.blocks) || !document.settings) {
    throw createError({ statusCode: 422, statusMessage: 'No email document provided.' })
  }
  if (!document.blocks.length) {
    throw createError({ statusCode: 422, statusMessage: 'The email is empty — add some blocks first.' })
  }

  const existing = await listUserTemplates(user.id)
  if (existing.length >= MAX_TEMPLATES_PER_USER) {
    throw createError({ statusCode: 422, statusMessage: `You've reached the limit of ${MAX_TEMPLATES_PER_USER} saved templates.` })
  }

  const template = await createUserTemplate({
    ownerId: user.id,
    name: name.slice(0, 120),
    description: (body.description ?? '').trim().slice(0, 300),
    document
  })

  return {
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      updatedAt: template.updatedAt
    }
  }
})
