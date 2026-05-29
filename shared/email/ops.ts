/**
 * Pure operations over an EmailDocument. These are the *only* mutations the AI
 * tools (server/api/email-projects/[id]/chat.post.ts) and the client editor
 * perform, so behaviour stays identical on both sides. Every op returns a new
 * document (immutably) and never throws on a missing id — it reports via the
 * returned `ok`/`message` so the AI gets useful tool feedback.
 */
import {
  coerceNumberLike,
  defaultBlock,
  findBlock,
  normalizePadding,
  type EmailBlock,
  type EmailBlockType,
  type EmailDocument,
  walkBlocks
} from './blocks'

export interface OpResult {
  ok: boolean
  message: string
  doc: EmailDocument
}

const NUMERIC_BLOCK_FIELDS = new Set(['level', 'fontSize', 'radius', 'width', 'thickness', 'height', 'gap'])
const NUMERIC_SETTINGS_FIELDS = new Set(['contentWidth'])

function clone(doc: EmailDocument): EmailDocument {
  return structuredClone(doc)
}

let _counter = 0
/** Stable-ish block id. Time-free (works in workflow scripts/SSR) + a counter. */
export function newBlockId(): string {
  _counter = (_counter + 1) % 1_000_000
  return `blk_${_counter.toString(36)}${Math.round(performance.now()).toString(36)}`
}

/** Replace an existing block (matched by `block.id`) in-place anywhere in the tree. */
function replaceBlock(blocks: EmailBlock[], updated: EmailBlock): boolean {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    if (b.id === updated.id) {
      blocks[i] = updated
      return true
    }
    if (b.type === 'columns') {
      for (const col of b.columns) {
        if (replaceBlock(col, updated)) return true
      }
    }
  }
  return false
}

/** Remove a block by id anywhere in the tree. */
function removeBlockById(blocks: EmailBlock[], id: string): boolean {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    if (b.id === id) {
      blocks.splice(i, 1)
      return true
    }
    if (b.type === 'columns') {
      for (const col of b.columns) {
        if (removeBlockById(col, id)) return true
      }
    }
  }
  return false
}

/** Replace the entire document (settings + blocks). Assigns ids to any block missing one. */
export function setDocument(_doc: EmailDocument, next: EmailDocument): OpResult {
  const doc = structuredClone(next)
  walkBlocks(doc.blocks, (b) => {
    if (!b.id) (b as { id: string }).id = newBlockId()
  })
  return { ok: true, message: `Replaced the email with ${doc.blocks.length} top-level block(s).`, doc }
}

/** Patch document-level settings (subject, colors, width, fonts…). */
export function updateSettings(doc: EmailDocument, patch: Partial<EmailDocument['settings']>): OpResult {
  const next = clone(doc)
  const normalized = { ...patch } as Record<string, unknown>
  for (const field of NUMERIC_SETTINGS_FIELDS) {
    if (field in normalized) {
      normalized[field] = coerceNumberLike(normalized[field], next.settings[field as keyof EmailDocument['settings']] as number)
    }
  }
  next.settings = { ...next.settings, ...normalized }
  return { ok: true, message: 'Updated email settings.', doc: next }
}

/** Shallow-merge a patch into one block (by id). Type is never changed. */
export function updateBlock(doc: EmailDocument, id: string, patch: Record<string, unknown>): OpResult {
  const next = clone(doc)
  const target = findBlock(next.blocks, id)
  if (!target) return { ok: false, message: `No block with id "${id}".`, doc }
  const { id: _id, type: _type, ...safe } = patch as Record<string, unknown>
  if ('padding' in safe) safe.padding = normalizePadding(safe.padding)
  for (const field of NUMERIC_BLOCK_FIELDS) {
    if (field in safe) {
      safe[field] = coerceNumberLike(safe[field], (target as Record<string, unknown>)[field] as number ?? 0)
    }
  }
  Object.assign(target, safe)
  replaceBlock(next.blocks, target)
  return { ok: true, message: `Updated ${target.type} block "${id}".`, doc: next }
}

/**
 * Insert a new block. `at` is the index among top-level blocks (default: end).
 * `props` overrides the type defaults. Returns the new id in the message.
 */
export function addBlock(
  doc: EmailDocument,
  type: EmailBlockType,
  props: Record<string, unknown> = {},
  at?: number
): OpResult & { id: string } {
  const next = clone(doc)
  const id = newBlockId()
  const block = { ...defaultBlock(type, id), ...props, id, type } as EmailBlock
  const idx = typeof at === 'number' && at >= 0 && at <= next.blocks.length ? at : next.blocks.length
  next.blocks.splice(idx, 0, block)
  return { ok: true, id, message: `Added ${type} block "${id}" at position ${idx}.`, doc: next }
}

/** Remove a block by id. */
export function removeBlock(doc: EmailDocument, id: string): OpResult {
  const next = clone(doc)
  if (!removeBlockById(next.blocks, id)) return { ok: false, message: `No block with id "${id}".`, doc }
  return { ok: true, message: `Removed block "${id}".`, doc: next }
}

/** Move a top-level block to a new index. */
export function moveBlock(doc: EmailDocument, id: string, to: number): OpResult {
  const next = clone(doc)
  const from = next.blocks.findIndex(b => b.id === id)
  if (from === -1) return { ok: false, message: `No top-level block with id "${id}".`, doc }
  const [block] = next.blocks.splice(from, 1)
  const idx = Math.max(0, Math.min(to, next.blocks.length))
  next.blocks.splice(idx, 0, block!)
  return { ok: true, message: `Moved block "${id}" to position ${idx}.`, doc: next }
}
