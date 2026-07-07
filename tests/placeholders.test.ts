import { describe, expect, test } from 'bun:test'
import { applyTemplateVariables, extractTemplateVariables } from '../shared/email/placeholders'
import { emptyDocument, type EmailDocument } from '../shared/email/blocks'

function docWithVars(): EmailDocument {
  const doc = emptyDocument()
  doc.settings.title = 'Hi {{ firstName }}'
  doc.blocks = [
    { id: 't', type: 'text', html: 'Your code is {{ code }} — thanks {{ firstName }}!', align: 'left' },
    { id: 'b', type: 'button', label: 'Open', href: '{{ cta_url }}', align: 'center', backgroundColor: '#000', color: '#fff' }
  ]
  return doc
}

describe('extractTemplateVariables', () => {
  test('finds unique keys across settings and blocks, sorted', () => {
    expect(extractTemplateVariables(docWithVars())).toEqual(['code', 'cta_url', 'firstName'])
  })

  test('tolerates flexible whitespace', () => {
    const doc = emptyDocument()
    doc.settings.title = '{{firstName}} and {{  lastName  }}'
    expect(extractTemplateVariables(doc)).toEqual(['firstName', 'lastName'])
  })
})

describe('applyTemplateVariables', () => {
  test('substitutes known keys everywhere', () => {
    const out = applyTemplateVariables(docWithVars(), { firstName: 'Ada', code: 'SAVE25', cta_url: 'https://a.com' })
    expect(out.settings.title).toBe('Hi Ada')
    expect((out.blocks[0] as { html: string }).html).toBe('Your code is SAVE25 — thanks Ada!')
    expect((out.blocks[1] as { href: string }).href).toBe('https://a.com')
  })

  test('leaves unknown keys as-is', () => {
    const out = applyTemplateVariables(docWithVars(), { firstName: 'Ada' })
    expect((out.blocks[0] as { html: string }).html).toContain('{{ code }}')
  })

  test('does not mutate the input', () => {
    const doc = docWithVars()
    applyTemplateVariables(doc, { firstName: 'Ada' })
    expect(doc.settings.title).toBe('Hi {{ firstName }}')
  })
})
