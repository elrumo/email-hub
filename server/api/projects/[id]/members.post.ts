import { findUserByEmail, updateContainer } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedContainer } from '../../../utils/projects'

/** Owner grants a signed-up user full view/edit access to the project. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const container = await requireOwnedContainer(id, user.id)

  const body = await readBody<{ email?: string }>(event)
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email) throw createError({ statusCode: 422, statusMessage: 'Provide the member\'s email.' })

  const member = await findUserByEmail(email)
  if (!member) throw createError({ statusCode: 404, statusMessage: 'No account exists with that email — they need to sign up first.' })
  if (member.id === user.id) throw createError({ statusCode: 422, statusMessage: 'You already own this project.' })

  const memberIds = [...new Set([...(container.memberIds ?? []), member.id])]
  await updateContainer(id, { memberIds })
  return { ok: true, member: { id: member.id, email: member.email, name: member.name } }
})
