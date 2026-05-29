import type { EmailDocument } from './blocks'

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

function replaceInString(value: string, vars: Record<string, string>): string {
  return value.replace(PLACEHOLDER_RE, (full, rawKey: string) => {
    const key = rawKey.trim()
    return Object.hasOwn(vars, key) ? String(vars[key] ?? '') : full
  })
}

function visit(value: unknown, vars: Record<string, string>, found?: Set<string>): unknown {
  if (typeof value === 'string') {
    if (found) {
      for (const match of value.matchAll(PLACEHOLDER_RE)) {
        const key = match[1]?.trim()
        if (key) found.add(key)
      }
    }
    return replaceInString(value, vars)
  }
  if (Array.isArray(value)) return value.map(item => visit(item, vars, found))
  if (!value || typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = visit(inner, vars, found)
  }
  return out
}

export function applyTemplateVariables(doc: EmailDocument, vars: Record<string, string>): EmailDocument {
  return visit(doc, vars) as EmailDocument
}

export function extractTemplateVariables(doc: EmailDocument): string[] {
  const found = new Set<string>()
  visit(doc, {}, found)
  return [...found].sort((a, b) => a.localeCompare(b))
}
