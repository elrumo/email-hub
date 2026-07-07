import { createError } from 'h3'
import { extractTemplateVariables } from '#shared/email/placeholders'
import type { EmailDocument } from '#shared/email/blocks'
import {
  createEmailVersion,
  getContainer,
  getFolder,
  getProject,
  latestEmailVersionAt,
  type EmailProject,
  type ProjectContainer,
  type ProjectFolder,
  type TemplateVariable
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
      const latest = await latestEmailVersionAt(projectId)
      if (Date.now() - latest < minIntervalMs) return
    }
    await createEmailVersion({
      projectId,
      name,
      document,
      variables,
      cause,
      createdAt: Date.now()
    })
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
