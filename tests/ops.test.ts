import { describe, expect, test } from 'bun:test'
import {
  addBlock,
  duplicateBlock,
  moveBlock,
  removeBlock,
  setDocument,
  updateBlock,
  updateSettings
} from '../shared/email/ops'
import { emptyDocument, findBlock, type ColumnsBlock, type EmailDocument } from '../shared/email/blocks'

function withColumns(): { doc: EmailDocument, columnsId: string } {
  const res = addBlock(emptyDocument(), 'columns', {
    columns: [
      [{ id: 'child_a', type: 'text', html: 'left', align: 'left' }],
      []
    ]
  })
  return { doc: res.doc, columnsId: res.id }
}

describe('addBlock', () => {
  test('appends with defaults and reports the id', () => {
    const res = addBlock(emptyDocument(), 'button')
    expect(res.ok).toBe(true)
    expect(res.doc.blocks.at(-1)!.id).toBe(res.id)
    expect(res.message).toContain(res.id)
  })

  test('inserts at a position', () => {
    const res = addBlock(emptyDocument(), 'divider', {}, 0)
    expect(res.doc.blocks[0]!.type).toBe('divider')
  })

  test('does not mutate the input document', () => {
    const doc = emptyDocument()
    const before = JSON.stringify(doc)
    addBlock(doc, 'spacer')
    expect(JSON.stringify(doc)).toBe(before)
  })
})

describe('updateBlock', () => {
  test('patches fields but never id or type', () => {
    const doc = emptyDocument()
    const id = doc.blocks[0]!.id
    const res = updateBlock(doc, id, { text: 'New', id: 'evil', type: 'button' })
    const block = findBlock(res.doc.blocks, id)!
    expect(res.ok).toBe(true)
    expect((block as { text: string }).text).toBe('New')
    expect(block.type).toBe('heading')
  })

  test('coerces numeric fields from strings and DOM-event-shaped values', () => {
    const doc = emptyDocument()
    const id = doc.blocks[0]!.id
    const res = updateBlock(doc, id, { level: '3', fontSize: { target: { value: '18' } } })
    const block = findBlock(res.doc.blocks, id) as { level: number, fontSize: number }
    expect(block.level).toBe(3)
    expect(block.fontSize).toBe(18)
  })

  test('reports missing ids without throwing', () => {
    const res = updateBlock(emptyDocument(), 'nope', { text: 'x' })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('nope')
  })
})

describe('duplicateBlock', () => {
  test('copies a top-level block right after the original with fresh ids', () => {
    const { doc, columnsId } = withColumns()
    const res = duplicateBlock(doc, columnsId)
    expect(res.ok).toBe(true)
    const idx = res.doc.blocks.findIndex(b => b.id === columnsId)
    const copy = res.doc.blocks[idx + 1] as ColumnsBlock
    expect(copy.type).toBe('columns')
    expect(copy.id).not.toBe(columnsId)
    expect(copy.columns[0]![0]!.id).not.toBe('child_a')
  })

  test('duplicates a block nested inside a column, in place', () => {
    const { doc } = withColumns()
    const res = duplicateBlock(doc, 'child_a')
    expect(res.ok).toBe(true)
    const cols = res.doc.blocks.find(b => b.type === 'columns') as ColumnsBlock
    expect(cols.columns[0]).toHaveLength(2)
    expect(res.doc.blocks).toHaveLength(doc.blocks.length)
  })

  test('reports missing ids', () => {
    expect(duplicateBlock(emptyDocument(), 'nope').ok).toBe(false)
  })
})

describe('removeBlock / moveBlock', () => {
  test('removes nested blocks', () => {
    const { doc } = withColumns()
    const res = removeBlock(doc, 'child_a')
    expect(res.ok).toBe(true)
    expect(findBlock(res.doc.blocks, 'child_a')).toBeNull()
  })

  test('moves and clamps the target index', () => {
    const doc = emptyDocument()
    const first = doc.blocks[0]!.id
    const res = moveBlock(doc, first, 99)
    expect(res.ok).toBe(true)
    expect(res.doc.blocks.at(-1)!.id).toBe(first)
  })
})

describe('setDocument / updateSettings', () => {
  test('assigns ids to incoming blocks that lack one', () => {
    const res = setDocument(emptyDocument(), {
      settings: emptyDocument().settings,
      blocks: [{ type: 'text', html: 'hi', align: 'left' } as never]
    })
    expect(res.doc.blocks[0]!.id).toBeTruthy()
  })

  test('coerces numeric settings', () => {
    const res = updateSettings(emptyDocument(), { contentWidth: '640' as never })
    expect(res.doc.settings.contentWidth).toBe(640)
  })
})
