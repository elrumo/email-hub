import { describe, expect, test } from 'bun:test'
import { applyThemeToDocument, currentTheme, DEFAULT_THEME, THEME_PRESETS } from '../shared/email/theme'
import { emptyDocument, type ButtonBlock, type EmailDocument } from '../shared/email/blocks'

function docWithButton(): EmailDocument {
  const doc = emptyDocument()
  doc.blocks.push({
    id: 'btn',
    type: 'button',
    label: 'Go',
    href: 'https://a.com',
    align: 'center',
    backgroundColor: '#123456',
    color: '#ffffff',
    radius: 3
  })
  return doc
}

describe('currentTheme', () => {
  test('derives brand tokens from the first button when no theme is stored', () => {
    const theme = currentTheme(docWithButton())
    expect(theme.brand).toBe('#123456')
    expect(theme.radius).toBe(3)
  })

  test('prefers the stored theme when present', () => {
    const doc = docWithButton()
    doc.settings.theme = { ...DEFAULT_THEME, brand: '#ff0000' }
    expect(currentTheme(doc).brand).toBe('#ff0000')
  })
})

describe('applyThemeToDocument', () => {
  const midnight = THEME_PRESETS.find(p => p.id === 'midnight')!.theme

  test('restyles settings and blocks without touching structure or copy', () => {
    const doc = docWithButton()
    const next = applyThemeToDocument(doc, midnight)
    expect(next.settings.backgroundColor).toBe(midnight.background)
    expect(next.settings.theme?.brand).toBe(midnight.brand)
    const btn = next.blocks.find(b => b.type === 'button') as ButtonBlock
    expect(btn.backgroundColor).toBe(midnight.brand)
    expect(btn.color).toBe(midnight.onBrand)
    expect(btn.radius).toBe(midnight.radius)
    expect(btn.label).toBe('Go')
    expect(next.blocks.map(b => b.id)).toEqual(doc.blocks.map(b => b.id))
  })

  test('partial token patches merge over the current theme', () => {
    const doc = docWithButton()
    const next = applyThemeToDocument(doc, { brand: '#00ff00' })
    const btn = next.blocks.find(b => b.type === 'button') as ButtonBlock
    expect(btn.backgroundColor).toBe('#00ff00')
    // untouched tokens keep their derived values
    expect(btn.radius).toBe(3)
  })

  test('does not mutate the input document', () => {
    const doc = docWithButton()
    const before = JSON.stringify(doc)
    applyThemeToDocument(doc, midnight)
    expect(JSON.stringify(doc)).toBe(before)
  })
})
