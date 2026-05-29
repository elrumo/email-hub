/**
 * EmailDocument → email-safe HTML.
 *
 * "Email-safe" here means: a single outer table for the page background, an
 * inner fixed-width table for the content card, every block rendered as table
 * rows with inline styles only (no <style>, no flexbox, no external CSS), and
 * widths/alignment expressed the way Outlook and Gmail actually honour. This is
 * the canonical output used for the live preview, the copy-to-clipboard export,
 * and what the AI's edits ultimately produce.
 *
 * The same renderer runs on the client (preview iframe) and could run on the
 * server (export), so it must stay dependency-free and deterministic.
 */
import type {
  Align,
  ButtonBlock,
  ColumnsBlock,
  DividerBlock,
  EmailBlock,
  EmailDocument,
  HeadingBlock,
  HtmlBlock,
  ImageBlock,
  SpacerBlock,
  TextBlock
} from './blocks'
import { paddingCssValue, paddingHorizontal } from './blocks'

/** Escape text destined for an HTML text node / attribute value. */
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Allow only a tiny, email-safe inline subset of HTML for the rich-text fields
 * (text blocks). Everything else is escaped. We tokenise tags and pass through
 * a strict allowlist; `href` on <a> is sanitised to http(s)/mailto only.
 */
const INLINE_ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'a', 'span'])

export function sanitizeInline(html: string): string {
  if (!html) return ''
  return String(html).replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase()
    if (!INLINE_ALLOWED.has(name)) return '' // drop disallowed tags, keep inner text
    const closing = full.startsWith('</')
    if (closing) return `</${name}>`
    if (name === 'br') return '<br>'
    if (name === 'a') {
      const hrefMatch = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)')/i)
      const href = hrefMatch ? (hrefMatch[2] ?? hrefMatch[3] ?? '') : ''
      const safe = /^(https?:|mailto:)/i.test(href) ? href : '#'
      return `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer" style="color:inherit;">`
    }
    return `<${name}>`
  })
}

function cellOpen(block: EmailBlock, align?: Align): string {
  const bg = block.background ? `background-color:${esc(block.background)};` : ''
  const a = align ? `text-align:${align};` : ''
  return `<td style="padding:${paddingCssValue(block.padding)};${bg}${a}">`
}

function renderHeading(b: HeadingBlock): string {
  const sizes: Record<number, number> = { 1: 28, 2: 22, 3: 18 }
  const size = sizes[b.level] ?? 22
  const color = b.color ? `color:${esc(b.color)};` : ''
  return `${cellOpen(b, b.align)}<h${b.level} style="margin:0;font-size:${size}px;line-height:1.25;font-weight:700;${color}">${esc(b.text)}</h${b.level}></td>`
}

function renderText(b: TextBlock): string {
  const color = b.color ? `color:${esc(b.color)};` : ''
  const fs = b.fontSize ? `font-size:${b.fontSize}px;` : 'font-size:15px;'
  return `${cellOpen(b, b.align)}<div style="margin:0;line-height:1.6;${fs}${color}">${sanitizeInline(b.html)}</div></td>`
}

function renderButton(b: ButtonBlock): string {
  const href = /^(https?:|mailto:)/i.test(b.href) ? b.href : '#'
  const radius = typeof b.radius === 'number' ? b.radius : 6
  // Bulletproof-ish button: a table-wrapped anchor with inline padding.
  return `${cellOpen(b, b.align)}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;"><tr><td style="background-color:${esc(b.backgroundColor)};border-radius:${radius}px;"><a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:${esc(b.color)};text-decoration:none;border-radius:${radius}px;">${esc(b.label)}</a></td></tr></table></td>`
}

function renderImage(b: ImageBlock, contentWidth: number): string {
  const availableWidth = Math.max(contentWidth - paddingHorizontal(b.padding), 0)
  const w = b.width && b.width > 0 ? Math.min(b.width, contentWidth) : availableWidth
  const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${w}" style="display:block;width:${w}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;border-radius:4px;" />`
  const inner = b.href && /^(https?:|mailto:)/i.test(b.href)
    ? `<a href="${esc(b.href)}" target="_blank" rel="noopener noreferrer">${img}</a>`
    : img
  // center via a wrapper table when aligned center/right
  return `${cellOpen(b, b.align)}<div style="text-align:${b.align};">${inner}</div></td>`
}

function renderDivider(b: DividerBlock): string {
  const color = esc(b.color ?? '#e4e4e7')
  const t = typeof b.thickness === 'number' ? b.thickness : 1
  return `${cellOpen(b)}<div style="border-top:${t}px solid ${color};font-size:0;line-height:0;">&nbsp;</div></td>`
}

function renderSpacer(b: SpacerBlock): string {
  return `<td style="font-size:0;line-height:0;height:${b.height}px;">&nbsp;</td>`
}

function renderHtml(b: HtmlBlock): string {
  // Trusted-ish escape hatch: emitted verbatim inside a cell. The AI is
  // instructed to keep this email-safe; the user owns the risk for hand-typed
  // HTML (same trust model as the rest of this self-hosted, single-user app).
  return `${cellOpen(b)}${b.html ?? ''}</td>`
}

function renderColumns(b: ColumnsBlock, contentWidth: number): string {
  const cols = b.columns.length || 1
  const gap = typeof b.gap === 'number' ? b.gap : 16
  const inner = Math.max(contentWidth - paddingHorizontal(b.padding), 0)
  const colWidth = Math.floor((inner - gap * (cols - 1)) / cols)
  const cells = b.columns.map((col, i) => {
    const ml = i > 0 ? `padding-left:${gap}px;` : ''
    const body = col.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${col.map(child => `<tr>${renderBlock(child, colWidth)}</tr>`).join('')}</table>`
      : '&nbsp;'
    return `<td width="${colWidth}" valign="top" style="${ml}">${body}</td>`
  }).join('')
  return `${cellOpen(b)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td>`
}

/** Render a single block as a `<td>…</td>` (caller wraps in a `<tr>`). */
export function renderBlock(b: EmailBlock, contentWidth: number): string {
  switch (b.type) {
    case 'heading': return renderHeading(b)
    case 'text': return renderText(b)
    case 'button': return renderButton(b)
    case 'image': return renderImage(b, contentWidth)
    case 'divider': return renderDivider(b)
    case 'spacer': return renderSpacer(b)
    case 'columns': return renderColumns(b, contentWidth)
    case 'html': return renderHtml(b)
    default: return ''
  }
}

/** Render just the content rows (no <html> wrapper) — used by the live preview. */
export function renderBlocks(doc: EmailDocument): string {
  const { settings, blocks } = doc
  const rows = blocks.map(b => `<tr>${renderBlock(b, settings.contentWidth)}</tr>`).join('')
  return `<table role="presentation" width="${settings.contentWidth}" cellpadding="0" cellspacing="0" border="0" style="width:${settings.contentWidth}px;max-width:100%;background-color:${esc(settings.contentBackground)};border-radius:8px;overflow:hidden;">${rows}</table>`
}

/** Render the full, standalone, email-safe HTML document. */
export function renderEmailHtml(doc: EmailDocument): string {
  const { settings } = doc
  const preheader = settings.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(settings.preheader)}</div>`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${esc(settings.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${esc(settings.backgroundColor)};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${esc(settings.backgroundColor)};font-family:${settings.fontFamily.replace(/"/g, '\'')};color:${esc(settings.textColor)};">
<tr>
<td align="center" style="padding:24px 12px;">
${renderBlocks(doc)}
</td>
</tr>
</table>
</body>
</html>`
}
