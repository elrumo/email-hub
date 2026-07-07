import { createError } from 'h3'
import { extractTemplateVariables } from '#shared/email/placeholders'
import type { EmailDocument } from '#shared/email/blocks'
import {
  getContainer,
  getFolder,
  getProject,
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
