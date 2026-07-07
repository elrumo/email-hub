import { createError } from 'h3'
import { extractTemplateVariables } from '#shared/email/placeholders'
import type { EmailDocument } from '#shared/email/blocks'
import { getProject, type EmailProject, type TemplateVariable } from './parse'

export async function requireOwnedProject(id: string, ownerId: string): Promise<EmailProject> {
  const project = await getProject(id)
  if (!project || project.ownerId !== ownerId) {
    throw createError({ statusCode: 404, statusMessage: 'Email project not found' })
  }
  return project
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
    updatedAt: p.updatedAt,
    createdAt: p.createdAt
  }
}
