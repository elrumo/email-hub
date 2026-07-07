import { randomBytes } from 'node:crypto'
import { updateContainer } from '../../../utils/parse'
import { requireUser } from '../../../utils/auth'
import { requireOwnedContainer } from '../../../utils/projects'

const MODES = ['off', 'view', 'edit'] as const

/** Owner sets project-wide link sharing: every email in it inherits access. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const container = await requireOwnedContainer(id, user.id)

  const body = await readBody<{ mode?: string }>(event)
  const mode = body.mode as typeof MODES[number]
  if (!MODES.includes(mode)) {
    throw createError({ statusCode: 422, statusMessage: 'mode must be off, view or edit.' })
  }

  const token = mode === 'off' ? null : (container.shareToken ?? randomBytes(18).toString('base64url'))
  await updateContainer(id, { shareToken: token, shareMode: mode === 'off' ? null : mode })

  const appUrl = (useRuntimeConfig().public.appUrl || '').replace(/\/$/, '')
  return { mode, token, url: token ? `${appUrl}/share/${token}` : null }
})
