import { createError } from 'h3'
import { extractTemplateVariables, applyTemplateVariables } from '#shared/email/placeholders'
import { renderEmailHtml } from '#shared/email/render'
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

const MAX_TAGS = 50
const MAX_TAG_LENGTH = 64
const MAX_DESCRIPTION_LENGTH = 2000

/**
 * Coerce arbitrary request input into a clean tag list: strings only, trimmed,
 * de-duplicated case-insensitively (first spelling wins), empties dropped, and
 * bounded in both count and per-tag length. Returns `null` when the caller did
 * not supply the field at all (so updates can distinguish "leave as-is").
 */
export function normalizeTags(input: unknown): string[] | null {
  if (input == null) return null
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/**
 * Coerce request input into a description string or null. Returns `undefined`
 * when the field is absent so updates can leave the stored value untouched.
 */
export function normalizeDescription(input: unknown): string | null | undefined {
  if (input === undefined) return undefined
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  return trimmed ? trimmed.slice(0, MAX_DESCRIPTION_LENGTH) : null
}

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
    description: p.description ?? null,
    tags: p.tags ?? [],
    subject: doc?.settings?.title ?? '',
    variables: p.variables ?? [],
    projectId: p.projectId ?? null,
    folderId: p.folderId ?? null,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt
  }
}

/**
 * A template (email document) as returned by the public templates endpoint.
 * With `includeHtml`, the full block `document` and its rendered, email-safe
 * `html` are included (variables substituted with their declared defaults);
 * otherwise only lightweight metadata is returned.
 */
export function templateEntry(p: EmailProject, includeHtml: boolean) {
  const base = projectSummary(p)
  if (!includeHtml) return base

  const declared = (p.variables ?? []) as TemplateVariable[]
  const vars: Record<string, string> = {}
  for (const v of declared) {
    if (v.defaultValue != null) vars[v.key] = v.defaultValue
  }
  const doc = applyTemplateVariables(p.document as EmailDocument, vars)
  return {
    ...base,
    // subject reflects substituted document so {{ vars }} in the title resolve
    subject: doc.settings.title,
    document: p.document as EmailDocument,
    html: renderEmailHtml(doc)
  }
}
