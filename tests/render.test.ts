import { describe, expect, test } from 'bun:test'
import { renderEmailHtml, sanitizeInline } from '../shared/email/render'
import { emptyDocument, type EmailDocument } from '../shared/email/blocks'

describe('sanitizeInline', () => {
  test('keeps the allowed inline subset', () => {
    expect(sanitizeInline('<b>bold</b> and <i>italic</i><br>')).toBe('<b>bold</b> and <i>italic</i><br>')
  })

  test('drops disallowed tags but keeps their text', () => {
    expect(sanitizeInline('<script>alert(1)</script><div>hi</div>')).toBe('alert(1)hi')
  })

  test('strips attributes from allowed tags', () => {
    expect(sanitizeInline('<b onclick="x()">hi</b>')).toBe('<b>hi</b>')
  })

  test('neutralizes javascript: hrefs', () => {
    const out = sanitizeInline('<a href="javascript:alert(1)">x</a>')
    expect(out).toContain('href="#"')
    expect(out).not.toContain('javascript:')
  })

  test('keeps http(s) and mailto hrefs with safe rel/target', () => {
    const out = sanitizeInline('<a href="https://acme.com">x</a>')
    expect(out).toContain('href="https://acme.com"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
})

describe('renderEmailHtml', () => {
  test('escapes the title and emits a full document', () => {
    const doc = emptyDocument()
    doc.settings.title = '<Launch> & more'
    const html = renderEmailHtml(doc)
    expect(html).toStartWith('<!doctype html>')
    expect(html).toContain('&lt;Launch&gt; &amp; more')
    expect(html).not.toContain('<Launch>')
  })

  test('includes the hidden preheader when set', () => {
    const doc = emptyDocument()
    doc.settings.preheader = 'Peek at this'
    expect(renderEmailHtml(doc)).toContain('Peek at this')
    doc.settings.preheader = ''
    expect(renderEmailHtml(doc)).not.toContain('mso-hide:all')
  })

  test('sanitizes unsafe button hrefs to #', () => {
    const doc: EmailDocument = {
      settings: emptyDocument().settings,
      blocks: [{ id: 'b', type: 'button', label: 'Hi', href: 'javascript:alert(1)', align: 'center', backgroundColor: '#000', color: '#fff' }]
    }
    const html = renderEmailHtml(doc)
    expect(html).toContain('href="#"')
    expect(html).not.toContain('javascript:')
  })

  test('renders columns with computed widths', () => {
    const doc: EmailDocument = {
      settings: { ...emptyDocument().settings, contentWidth: 600 },
      blocks: [{
        id: 'c',
        type: 'columns',
        gap: 20,
        columns: [
          [{ id: 'l', type: 'text', html: 'left', align: 'left' }],
          [{ id: 'r', type: 'text', html: 'right', align: 'left' }]
        ]
      }]
    }
    const html = renderEmailHtml(doc)
    // (600 - 20) / 2 = 290
    expect(html).toContain('width="290"')
  })

  test('caps image width at the content width', () => {
    const doc: EmailDocument = {
      settings: emptyDocument().settings,
      blocks: [{ id: 'i', type: 'image', src: 'https://a.com/x.png', alt: 'x', align: 'center', width: 5000 }]
    }
    expect(renderEmailHtml(doc)).toContain('width="600"')
  })
})
