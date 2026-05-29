import { desc } from 'drizzle-orm'
import { getDb } from '../../db'
import { emailProjects } from '../../db/schema'

/** List email projects (most recently edited first), without the full document. */
export default defineEventHandler(async () => {
  const db = getDb()
  const rows = await db
    .select({
      id: emailProjects.id,
      name: emailProjects.name,
      document: emailProjects.document,
      createdAt: emailProjects.createdAt,
      updatedAt: emailProjects.updatedAt
    })
    .from(emailProjects)
    .orderBy(desc(emailProjects.updatedAt))

  // Return a lightweight block count for the card UI rather than the whole doc.
  return rows.map((r) => {
    const doc = r.document as { blocks?: unknown[], settings?: { title?: string } }
    return {
      id: r.id,
      name: r.name,
      blockCount: Array.isArray(doc?.blocks) ? doc.blocks.length : 0,
      subject: doc?.settings?.title ?? '',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }
  })
})
