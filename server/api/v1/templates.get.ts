import { createError } from 'h3'
import { listContainers, listProjects } from '../../utils/parse'
import { requireApiUser } from '../../utils/apiKey'
import { requireOwnedContainer, templateEntry } from '../../utils/projects'

/**
 * List every template (email document) the caller owns, optionally scoped to a
 * single project.
 *
 *   GET /api/v1/templates                     → all templates (the root)
 *   GET /api/v1/templates?projectId=<id>      → templates in one project
 *   GET /api/v1/templates?projectId=root      → all templates (explicit root)
 *
 * `include` controls how much of each template is returned:
 *   include=metadata  (default) → id, name, description, tags, subject, vars…
 *   include=full                → the above plus the block `document` and the
 *                                 rendered, email-safe `html`.
 */
export default defineEventHandler(async (event) => {
  const user = await requireApiUser(event)
  const query = getQuery(event)

  const include = String(query.include ?? 'metadata').toLowerCase()
  if (include !== 'metadata' && include !== 'full') {
    throw createError({ statusCode: 422, statusMessage: "include must be 'metadata' or 'full'" })
  }
  const includeHtml = include === 'full'

  const rawProjectId = typeof query.projectId === 'string' ? query.projectId.trim() : ''
  // Absent or the literal "root" means every project (the root that holds them all).
  const scopeId = rawProjectId && rawProjectId.toLowerCase() !== 'root' ? rawProjectId : null

  let scope: { id: string, name: string } | null = null
  if (scopeId) {
    const container = await requireOwnedContainer(scopeId, user.id)
    scope = { id: container.id, name: container.name }
  }

  const [emails, containers] = await Promise.all([
    listProjects(user.id),
    // Names let callers make sense of the flat root listing without a second call.
    listContainers(user.id)
  ])
  const nameById = new Map(containers.map(c => [c.id, c.name]))

  const rows = scopeId ? emails.filter(e => e.projectId === scopeId) : emails
  const templates = rows.map(e => ({
    ...templateEntry(e, includeHtml),
    projectName: e.projectId ? nameById.get(e.projectId) ?? null : null
  }))

  return {
    projectId: scope?.id ?? null,
    projectName: scope?.name ?? null,
    include,
    count: templates.length,
    templates
  }
})
