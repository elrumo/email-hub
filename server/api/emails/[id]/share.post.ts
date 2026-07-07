import { randomBytes } from 'node:crypto'
import { updateProject } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedProject } from '../../../utils/projects'

const MODES = ['off', 'view', 'edit'] as const

/** Owner sets the email's link sharing: off, view-only, or signed-in edit. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const email = await requireOwnedProject(id, user.id)

  const body = await readBody<{ mode?: string }>(event)
  const mode = body.mode as typeof MODES[number]
  if (!MODES.includes(mode)) {
    throw createError({ statusCode: 422, statusMessage: 'mode must be off, view or edit.' })
  }

  const token = mode === 'off' ? null : (email.shareToken ?? randomBytes(18).toString('base64url'))
  await updateProject(id, { shareToken: token, shareMode: mode === 'off' ? null : mode })

  const appUrl = (useRuntimeConfig().public.appUrl || '').replace(/\/$/, '')
  return {
    mode,
    token,
    url: token ? `${appUrl}/share/${token}` : null,
    editUrl: token && mode === 'edit' ? `${appUrl}/app/emails/${id}?share=${token}` : null
  }
})
