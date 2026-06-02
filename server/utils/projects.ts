import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { extractTemplateVariables } from '#shared/email/placeholders'
import type { EmailDocument } from '#shared/email/blocks'
import { getDb } from '../db'
import { emailProjects, type EmailProjectRow, type TemplateVariable } from '../db/schema'

/** Load a project that belongs to `ownerId`, or throw 404. */
export async function requireOwnedProject(id: string, ownerId: string): Promise<EmailProjectRow> {
  const rows = await getDb()
    .select()
    .from(emailProjects)
    .where(and(eq(emailProjects.id, id), eq(emailProjects.ownerId, ownerId)))
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Email project not found' })
  return project
}

/**
 * Reconcile the declared variable list with the placeholders actually present
 * in the document. Keeps existing labels/defaults, adds newly-typed ones, drops
 * ones no longer referenced. Returns a stable, sorted list.
 */
export function reconcileVariables(
  doc: EmailDocument,
  declared: TemplateVariable[] = []
): TemplateVariable[] {
  const present = new Set(extractTemplateVariables(doc))
  const byKey = new Map(declared.map(v => [v.key, v]))
  const out: TemplateVariable[] = []
  for (const key of present) {
    out.push(byKey.get(key) ?? { key })
  }
  return out.sort((a, b) => a.key.localeCompare(b.key))
}

export function projectSummary(p: EmailProjectRow) {
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
