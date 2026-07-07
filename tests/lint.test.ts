import { describe, expect, test } from 'bun:test'
import { contrastRatio, lintEmailDocument, lintSummaryForPrompt } from '../shared/email/lint'
import { emptyDocument, type EmailDocument } from '../shared/email/blocks'

function messyDocument(): EmailDocument {
  return {
    settings: {
      backgroundColor: '#f4f4f5',
      contentBackground: '#ffffff',
      contentWidth: 600,
      fontFamily: 'Arial',
      textColor: '#18181b',
      title: 'Untitled email',
      preheader: ''
    },
    blocks: [
      { id: 'h1', type: 'heading', text: 'Hello', level: 1, align: 'left', color: '#f5f5f5' },
      { id: 'b1', type: 'button', label: 'Go', href: 'https://example.com', align: 'center', backgroundColor: '#ffffff', color: '#fefefe' },
      { id: 'i1', type: 'image', src: 'https://dummyimage.com/600x200', alt: '', align: 'center' },
      { id: 't1', type: 'text', html: 'Hi {{ firstName }} <a href="#">click</a>', align: 'left' },
      { id: 'x1', type: 'html', html: '<script>alert(1)</script>' }
    ] as EmailDocument['blocks']
  }
}

describe('lintEmailDocument', () => {
  const issues = lintEmailDocument(messyDocument())
  const codes = issues.map(i => i.code)

  test.each([
    'subject-missing',
    'preheader-missing',
    'contrast-low',
    'image-placeholder',
    'image-alt-missing',
    'html-risky',
    'unsubscribe-missing'
  ])('flags %s', (code) => {
    expect(codes).toContain(code)
  })

  test('flags dead links on both the button and the text anchor', () => {
    const dead = issues.filter(i => i.code === 'link-dead')
    expect(dead.map(i => i.blockId).sort()).toEqual(['b1', 't1'])
  })

  test('errors carry error severity, hints carry warnings', () => {
    expect(issues.find(i => i.code === 'link-dead')?.severity).toBe('error')
    expect(issues.find(i => i.code === 'image-alt-missing')?.severity).toBe('warning')
  })

  test('mustache hrefs count as live links', () => {
    const doc = messyDocument()
    ;(doc.blocks[1] as { href: string }).href = '{{ cta_url }}'
    const next = lintEmailDocument(doc)
    expect(next.some(i => i.code === 'link-dead' && i.blockId === 'b1')).toBe(false)
  })

  test('a well-formed email produces no findings', () => {
    const doc = emptyDocument()
    doc.settings.title = 'July product news'
    doc.settings.preheader = 'Everything we shipped for you this month.'
    doc.blocks.push({
      id: 'f1',
      type: 'text',
      html: 'You can <a href="https://acme.com/unsub">unsubscribe</a> anytime.',
      align: 'center'
    })
    expect(lintEmailDocument(doc)).toEqual([])
  })

  test('flags unusual content width', () => {
    const doc = emptyDocument()
    doc.settings.contentWidth = 900
    expect(lintEmailDocument(doc).map(i => i.code)).toContain('width-unusual')
  })

  test('flags overly long subject lines', () => {
    const doc = emptyDocument()
    doc.settings.title = 'A'.repeat(70)
    expect(lintEmailDocument(doc).map(i => i.code)).toContain('subject-long')
  })
})

describe('contrastRatio', () => {
  test('black on white is ~21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')!).toBeGreaterThan(20)
  })
  test('supports 3-digit hex', () => {
    expect(contrastRatio('#000', '#fff')!).toBeGreaterThan(20)
  })
  test('is symmetric', () => {
    expect(contrastRatio('#336699', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#336699')!, 5)
  })
  test('returns null for non-hex colors', () => {
    expect(contrastRatio('red', '#ffffff')).toBeNull()
    expect(contrastRatio(undefined, '#ffffff')).toBeNull()
  })
})

describe('lintSummaryForPrompt', () => {
  test('empty findings read as all-clear', () => {
    expect(lintSummaryForPrompt([])).toContain('No outstanding')
  })
  test('caps the list and reports the overflow', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      code: 'x',
      severity: 'warning' as const,
      message: `Issue ${i}`
    }))
    const text = lintSummaryForPrompt(many, 8)
    expect(text).toContain('Issue 7')
    expect(text).not.toContain('Issue 9')
    expect(text).toContain('4 more')
  })
})
