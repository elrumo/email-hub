/**
 * Deterministic email review — a dependency-free linter over an EmailDocument.
 *
 * Runs identically on the client (the editor's Review tab, live on every edit)
 * and on the server (its findings are injected into the AI system prompt so
 * Postcard AI can proactively fix them). Checks are deliberately cheap and
 * deterministic: deliverability basics, accessibility, dead links, contrast
 * and copy hygiene. Anything subjective stays with the AI.
 */
import type { EmailBlock, EmailDocument } from './blocks'
import { walkBlocks } from './blocks'

export type LintSeverity = 'error' | 'warning'

export interface LintIssue {
  /** stable machine code, e.g. 'image-alt-missing' */
  code: string
  severity: LintSeverity
  /** human-readable finding, shown in the Review tab */
  message: string
  /** offending block, when the finding is block-scoped */
  blockId?: string
  /** one-tap instruction for "Fix with AI" */
  fixPrompt?: string
}

const PLACEHOLDER_IMAGE_RE = /(dummyimage\.com|via\.placeholder\.com|placehold\.co|placekitten\.com|picsum\.photos)/i
const UNSUBSCRIBE_RE = /unsubscribe|opt[\s-]?out|manage\s+(your\s+)?preferences/i
const RISKY_HTML_RE = /<\s*(script|iframe|object|embed|form)\b|\bon(load|error|click|mouseover)\s*=/i

/** True when an href is a real destination (mustache links count as real). */
function isLiveHref(href: string | undefined | null): boolean {
  const value = (href ?? '').trim()
  if (!value || value === '#') return false
  if (value.includes('{{')) return true
  if (/^mailto:/i.test(value)) return true
  if (!/^https?:\/\//i.test(value)) return false
  return !/^https?:\/\/(www\.)?example\.(com|org|net)\b/i.test(value)
}

/** Collapse inline HTML to its readable text. */
export function stripTags(html: string): string {
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ---- WCAG-ish contrast --------------------------------------------------------

/** Parse #rgb / #rrggbb; anything else (named colors, rgb()) returns null. */
function parseHex(color: string | undefined | null): [number, number, number] | null {
  const value = (color ?? '').trim()
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)
  if (!match) return null
  let hex = match[1]!
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ]
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two colors, or null when either isn't plain hex. */
export function contrastRatio(a: string | undefined | null, b: string | undefined | null): number | null {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return null
  const la = luminance(ca)
  const lb = luminance(cb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ---- the linter ---------------------------------------------------------------

export function lintEmailDocument(doc: EmailDocument): LintIssue[] {
  const issues: LintIssue[] = []
  const { settings } = doc
  const push = (issue: LintIssue) => issues.push(issue)

  // Subject / preheader hygiene.
  const title = (settings.title ?? '').trim()
  if (!title || /^untitled email$/i.test(title)) {
    push({
      code: 'subject-missing',
      severity: 'error',
      message: 'The email has no subject line.',
      fixPrompt: 'Write a concrete subject line (under 50 characters) for this email and set it via settings.title.'
    })
  } else if (title.length > 60) {
    push({
      code: 'subject-long',
      severity: 'warning',
      message: `The subject is ${title.length} characters — inboxes truncate around 50–60.`,
      fixPrompt: 'Shorten the subject line to under 50 characters without losing its meaning.'
    })
  }
  const preheader = (settings.preheader ?? '').trim()
  if (!preheader) {
    push({
      code: 'preheader-missing',
      severity: 'warning',
      message: 'No preheader set — inboxes will show arbitrary body text as the preview.',
      fixPrompt: 'Write a preheader that complements the subject line and set it via settings.preheader.'
    })
  } else if (preheader.length > 110) {
    push({
      code: 'preheader-long',
      severity: 'warning',
      message: `The preheader is ${preheader.length} characters — keep it under ~100.`,
      fixPrompt: 'Shorten the preheader to under 100 characters.'
    })
  }

  // Unusual content width.
  const width = settings.contentWidth
  if (typeof width === 'number' && (width < 320 || width > 700)) {
    push({
      code: 'width-unusual',
      severity: 'warning',
      message: `Content width is ${width}px — most email clients render best at 480–640px.`,
      fixPrompt: 'Set the content width back to 600px.'
    })
  }

  // Block-scoped checks.
  let allText = `${title} ${preheader}`
  walkBlocks(doc.blocks, (b: EmailBlock) => {
    const cardBg = b.background ?? settings.contentBackground

    if (b.type === 'heading') {
      allText += ` ${b.text}`
      if (!(b.text ?? '').trim()) {
        push({ code: 'block-empty', severity: 'warning', message: 'A heading block is empty.', blockId: b.id, fixPrompt: `Give heading block ${b.id} real copy or remove it.` })
      }
      const ratio = contrastRatio(b.color ?? settings.textColor, cardBg)
      if (ratio != null && ratio < 3) {
        push({ code: 'contrast-low', severity: 'warning', message: `A heading's color barely contrasts with its background (${ratio.toFixed(1)}:1).`, blockId: b.id, fixPrompt: `Increase the color contrast of heading block ${b.id} to at least 4.5:1 against its background.` })
      }
    }

    if (b.type === 'text') {
      const text = stripTags(b.html)
      allText += ` ${text}`
      if (!text) {
        push({ code: 'block-empty', severity: 'warning', message: 'A text block is empty.', blockId: b.id, fixPrompt: `Give text block ${b.id} real copy or remove it.` })
      }
      const ratio = contrastRatio(b.color ?? settings.textColor, cardBg)
      if (ratio != null && ratio < 3) {
        push({ code: 'contrast-low', severity: 'warning', message: `A text block's color barely contrasts with its background (${ratio.toFixed(1)}:1).`, blockId: b.id, fixPrompt: `Increase the color contrast of text block ${b.id} to at least 4.5:1 against its background.` })
      }
      for (const match of String(b.html ?? '').matchAll(/href\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
        const href = match[2] ?? match[3] ?? ''
        if (!isLiveHref(href)) {
          push({ code: 'link-dead', severity: 'error', message: `A text link points to a placeholder (${href || 'empty'}).`, blockId: b.id, fixPrompt: `Ask me for the real destination of the link in text block ${b.id}, or use a {{ url }} variable.` })
        }
      }
    }

    if (b.type === 'button') {
      allText += ` ${b.label}`
      if (!(b.label ?? '').trim()) {
        push({ code: 'block-empty', severity: 'warning', message: 'A button has no label.', blockId: b.id, fixPrompt: `Write an action-oriented label for button block ${b.id}.` })
      }
      if (!isLiveHref(b.href)) {
        push({ code: 'link-dead', severity: 'error', message: `The "${b.label}" button links to a placeholder (${(b.href ?? '').trim() || 'empty'}).`, blockId: b.id, fixPrompt: `Ask me for the real destination of button block ${b.id}, or use a {{ url }} variable.` })
      }
      const ratio = contrastRatio(b.color, b.backgroundColor)
      if (ratio != null && ratio < 3) {
        push({ code: 'contrast-low', severity: 'warning', message: `The "${b.label}" button's label barely contrasts with its background (${ratio.toFixed(1)}:1).`, blockId: b.id, fixPrompt: `Fix the label/background contrast of button block ${b.id} (aim for at least 4.5:1) while keeping the brand color.` })
      }
    }

    if (b.type === 'image') {
      if (!(b.src ?? '').trim()) {
        push({ code: 'image-src-missing', severity: 'error', message: 'An image block has no image URL.', blockId: b.id, fixPrompt: `Remove image block ${b.id} or ask me for the image to use.` })
      } else if (PLACEHOLDER_IMAGE_RE.test(b.src)) {
        push({ code: 'image-placeholder', severity: 'warning', message: 'An image still uses a placeholder URL — swap it for a real, hosted image before sending.', blockId: b.id })
      }
      if (!(b.alt ?? '').trim()) {
        push({ code: 'image-alt-missing', severity: 'warning', message: 'An image has no alt text (many clients block images by default).', blockId: b.id, fixPrompt: `Write descriptive alt text for image block ${b.id}.` })
      }
      if (b.href !== undefined && !isLiveHref(b.href)) {
        push({ code: 'link-dead', severity: 'error', message: 'An image links to a placeholder URL.', blockId: b.id, fixPrompt: `Ask me for the real destination of the image link in block ${b.id}, or remove the link.` })
      }
    }

    if (b.type === 'html' && RISKY_HTML_RE.test(b.html ?? '')) {
      push({
        code: 'html-risky',
        severity: 'error',
        message: 'A custom HTML block contains scripts, frames or event handlers — email clients strip these and may flag the email as spam.',
        blockId: b.id,
        fixPrompt: `Rewrite custom HTML block ${b.id} as email-safe table-based HTML without scripts, iframes or event handlers.`
      })
    }
  })

  // Unsubscribe / compliance hint (marketing-email heuristic).
  if (doc.blocks.length > 0 && !UNSUBSCRIBE_RE.test(allText)) {
    push({
      code: 'unsubscribe-missing',
      severity: 'warning',
      message: 'No unsubscribe link found — marketing emails are required to include one.',
      fixPrompt: 'Add a muted footer with the sender address line and an {{ unsubscribe_url }} unsubscribe link.'
    })
  }

  return issues
}

/** Compact, prompt-friendly rendering of lint findings for the AI system prompt. */
export function lintSummaryForPrompt(issues: LintIssue[], max = 8): string {
  if (!issues.length) return 'No outstanding review findings.'
  const lines = issues.slice(0, max).map(i =>
    `- [${i.severity}] ${i.message}${i.blockId ? ` (block ${i.blockId})` : ''}`
  )
  if (issues.length > max) lines.push(`- …and ${issues.length - max} more.`)
  return lines.join('\n')
}
