import type { EmailDocument } from '#shared/email/blocks'
import type { TemplateVariable } from '../../../utils/parse'
import { updateProject } from '../../../utils/parse'
import { requireEmailAccess } from '../../../utils/access'
import { projectSummary, reconcileVariables, requireOwnedContainer, requireOwnedFolder, snapshotVersion } from '../../../utils/projects'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { email: project, level, user } = await requireEmailAccess(event, id, 'edit')
  const body = await readBody<{
    name?: string
    document?: EmailDocument
    variables?: TemplateVariable[]
    projectId?: string
    folderId?: string | null
    actorId?: string
  }>(event)

  const document = body.document ?? project.document
  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') patch.name = body.name.trim() || project.name
  if (body.document) patch.document = body.document
  patch.variables = reconcileVariables(document, body.variables ?? project.variables)
  // Live-sync echo suppression: remember which client tab saved last.
  patch.lastActorId = typeof body.actorId === 'string' ? body.actorId.slice(0, 64) : null

  // Moving between projects/folders is the owner's call only.
  if (level === 'owner' && (body.projectId !== undefined || body.folderId !== undefined)) {
    const targetProjectId = body.projectId ?? project.projectId
    if (targetProjectId) await requireOwnedContainer(targetProjectId, user!.id)
    let targetFolderId = body.folderId === undefined ? project.folderId : (body.folderId || null)
    if (targetFolderId) {
      const folder = await requireOwnedFolder(targetFolderId, user!.id)
      if (folder.projectId !== targetProjectId) targetFolderId = null
    }
    patch.projectId = targetProjectId
    patch.folderId = targetFolderId
  }

  const row = await updateProject(id, patch)

  // Periodic history checkpoint for manual edits (at most one every 10 min);
  // fire-and-forget so autosave stays snappy.
  if (body.document) {
    void snapshotVersion(id, row.name, row.document, row.variables ?? [], 'manual', 10 * 60_000)
  }

  return { project: projectSummary(row) }
})
