import type { EmailDocument } from '#shared/email/blocks'
import { createEmailVersion, getEmailVersion, updateProject } from '../../../../../utils/parse'
import { requireEmailAccess } from '../../../../../utils/access'
import { reconcileVariables } from '../../../../../utils/projects'

/**
 * Restore an email to a snapshot. The current state is snapshotted first
 * (cause 'restore') so a restore is always itself undoable from History.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const versionId = getRouterParam(event, 'versionId')!
  const { email } = await requireEmailAccess(event, id, 'edit')

  const version = await getEmailVersion(versionId)
  if (!version || version.projectId !== id) {
    throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  }

  await createEmailVersion({
    projectId: id,
    name: email.name,
    document: email.document,
    variables: email.variables ?? [],
    cause: 'restore'
  })

  const document = version.document as EmailDocument
  const project = await updateProject(id, {
    document,
    variables: reconcileVariables(document, version.variables ?? []),
    // Restores come from the History UI, not a live-typing tab — let every
    // open tab (including the restorer's) pick the change up via live sync.
    lastActorId: null
  })

  return {
    project: {
      id: project.id,
      name: project.name,
      document: project.document,
      variables: project.variables
    }
  }
})
