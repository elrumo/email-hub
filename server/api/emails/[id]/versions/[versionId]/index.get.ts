import { getEmailVersion } from '../../../../../utils/parse'
import { requireEmailAccess } from '../../../../../utils/access'

/** One full snapshot (document + variables) for previewing before a restore. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const versionId = getRouterParam(event, 'versionId')!
  await requireEmailAccess(event, id, 'edit')

  const version = await getEmailVersion(versionId)
  if (!version || version.projectId !== id) {
    throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  }
  return { version }
})
