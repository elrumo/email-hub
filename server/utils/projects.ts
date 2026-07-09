import { createError } from 'h3'
import { extractTemplateVariables } from '#shared/email/placeholders'
import type { EmailDocument } from '#shared/email/blocks'
import {
  createEmailVersion,
  getContainer,
  getFolder,
  getProject,
  getUserTemplate,
  latestEmailVersionAt,
  type EmailProject,
  type ProjectContainer,
  type ProjectFolder,
  type TemplateVariable,
  type UserTemplate
} from './parse'

export async function requireOwnedProject(id: string, ownerId: string): Promise<EmailProject> {
  const project = await getProject(id)
  if (!project || project.ownerId !== ownerId) {
    throw createError({ statusCode: 404, statusMessage: 'Email project not found' })
  }
  return project
}

export async function requireOwnedContainer(id: string, ownerId: string): Promise<ProjectContainer> {
  const container = await getContainer(id)
  if (!container || container.ownerId !== ownerId) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  return container
}

export async function requireOwnedFolder(id: string, ownerId: string): Promise<ProjectFolder> {
  const folder = await getFolder(id)
  if (!folder || folder.ownerId !== ownerId) {
    throw createError({ statusCode: 404, statusMessage: 'Folder not found' })
  }
  return folder
}

export async function requireOwnedTemplate(id: string, ownerId: string): Promise<UserTemplate> {
  const template = await getUserTemplate(id)
  if (!template || template.ownerId !== ownerId) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }
  return template
}

export function reconcileVariables(
  doc: EmailDocument,
  declared: TemplateVariable[] = []
): TemplateVariable[] {
  const present = new Set(extractTemplateVariables(doc))
  const byKey = new Map(declared.map(v => [v.key, v]))
  const out: TemplateVariable[] = []
  for (const key of present) out.push(byKey.get(key) ?? { key })
  return out.sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Per-process cache of each email's latest snapshot time. Autosave PUTs land
 * roughly once a second per active editor; without this every one of them
 * would query Parse just to learn "not yet" (the app runs single-node — the
 * same assumption rateLimit.ts documents). Falls back to the DB on cold start.
 */
const lastSnapshotAt = new Map<string, number>()

/**
 * Snapshot an email into version history unless a snapshot newer than
 * `minIntervalMs` already exists (pass 0 to always snapshot). History is a
 * convenience: failures are logged, never thrown.
 */
export async function snapshotVersion(
  projectId: string,
  name: string,
  document: EmailDocument,
  variables: TemplateVariable[],
  cause: 'ai' | 'manual' | 'restore',
  minIntervalMs = 0
): Promise<void> {
  try {
    if (minIntervalMs > 0) {
      const cached = lastSnapshotAt.get(projectId)
      const latest = cached ?? await latestEmailVersionAt(projectId)
      if (cached === undefined) lastSnapshotAt.set(projectId, latest)
      if (Date.now() - latest < minIntervalMs) return
    }
    await createEmailVersion({
      projectId,
      name,
      document,
      variables,
      cause
    })
    lastSnapshotAt.set(projectId, Date.now())
    if (lastSnapshotAt.size > 10_000) lastSnapshotAt.clear()
  } catch (e) {
    console.error('[versions] snapshot failed:', e instanceof Error ? e.message : e)
  }
}

export function projectSummary(p: EmailProject) {
  const doc = p.document as EmailDocument
  return {
    id: p.id,
    name: p.name,
    subject: doc?.settings?.title ?? '',
    variables: p.variables ?? [],
    projectId: p.projectId ?? null,
    folderId: p.folderId ?? null,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt
  }
}
