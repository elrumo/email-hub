import type { EmailDocument } from '#shared/email/blocks'
import { listEmailVersions } from '../../../../utils/parse'
import { requireEmailAccess } from '../../../../utils/access'

/**
 * Version history for one email — metadata only (documents are fetched
 * individually for preview/restore, so the list stays light).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await requireEmailAccess(event, id, 'edit')

  const versions = await listEmailVersions(id)
  return {
    versions: versions.map((v) => {
      const doc = v.document as EmailDocument
      return {
        id: v.id,
        name: v.name,
        cause: v.cause,
        subject: doc?.settings?.title ?? '',
        blockCount: doc?.blocks?.length ?? 0,
        createdAt: v.createdAt
      }
    })
  }
})
