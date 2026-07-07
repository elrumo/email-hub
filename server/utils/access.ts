import { createError, getQuery, type H3Event } from 'h3'
import {
  findContainerByShareToken,
  findEmailByShareToken,
  getContainer,
  getProject,
  type AppUser,
  type EmailProject,
  type ProjectContainer
} from './parse'
import { getSessionUser } from './auth'

/**
 * Collaborative access resolution. An email can be reached as its owner, as a
 * member of its project, or through a share link (email- or project-level):
 *   - shareMode 'view'  → anyone with the link can view
 *   - shareMode 'edit'  → anyone with the link can view; signed-in users edit
 *   - project members   → always view/edit everything in the project
 */
export type AccessLevel = 'owner' | 'edit' | 'view'

const LEVEL_RANK: Record<AccessLevel, number> = { view: 0, edit: 1, owner: 2 }

export function atLeast(level: AccessLevel | null, need: AccessLevel): boolean {
  return level != null && LEVEL_RANK[level] >= LEVEL_RANK[need]
}

function linkLevel(mode: string | null, user: AppUser | null): AccessLevel | null {
  if (mode === 'edit') return user ? 'edit' : 'view'
  if (mode === 'view') return 'view'
  return null
}

export async function resolveEmailAccess(
  email: EmailProject,
  user: AppUser | null,
  token: string | null
): Promise<AccessLevel | null> {
  if (user && email.ownerId === user.id) return 'owner'

  let container: ProjectContainer | null = null
  if (email.projectId) {
    container = await getContainer(email.projectId)
    if (container && user) {
      if (container.ownerId === user.id) return 'owner'
      if ((container.memberIds ?? []).includes(user.id)) return 'edit'
    }
  }

  if (token) {
    if (email.shareToken && email.shareToken === token) {
      return linkLevel(email.shareMode, user)
    }
    if (container?.shareToken && container.shareToken === token) {
      return linkLevel(container.shareMode, user)
    }
  }
  return null
}

/** Load an email and assert the caller reaches `need` (via session, membership or ?share= token). */
export async function requireEmailAccess(
  event: H3Event,
  id: string,
  need: AccessLevel
): Promise<{ email: EmailProject, level: AccessLevel, user: AppUser | null }> {
  const email = await getProject(id)
  if (!email) throw createError({ statusCode: 404, statusMessage: 'Email project not found' })

  const user = await getSessionUser(event)
  const q = getQuery(event)
  const token = typeof q.share === 'string' && q.share ? q.share : null

  const level = await resolveEmailAccess(email, user, token)
  if (!atLeast(level, need)) {
    throw createError({ statusCode: user ? 404 : 401, statusMessage: 'Email project not found' })
  }
  return { email, level: level!, user }
}

/** Resolve a public share token to either an email or a whole project. */
export async function resolveShareToken(token: string): Promise<
  | { type: 'email', email: EmailProject }
  | { type: 'project', container: ProjectContainer }
  | null
> {
  const email = await findEmailByShareToken(token)
  if (email && email.shareMode) return { type: 'email', email }
  const container = await findContainerByShareToken(token)
  if (container && container.shareMode) return { type: 'project', container }
  return null
}
