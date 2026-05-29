import type { CardStyle } from '~/types'

/**
 * Tailwind classes for a bento tile's chrome, driven by its per-tile
 * `cardStyle`. Shared by the home grid (WidgetTile) and the public /b/<slug>
 * view so both render identically. The `.bento-card` base (rounding + hover
 * lift) and the `.bento-elevated` shadow live in app/assets/css/main.css.
 *
 *   - shadow  → soft resting shadow + faint ring (the default bento look)
 *   - outline → ring border only, flat
 *   - none    → no shadow, no ring (flat tile)
 */
export function bentoCardClass(style?: CardStyle | null): string {
  const base = 'bento-card rounded-3xl'
  switch (style) {
    case 'outline':
      return `${base} ring-1 ring-default`
    case 'none':
      return `${base} ring-0`
    case 'shadow':
    default:
      return `${base} bento-elevated ring-1 ring-default`
  }
}

/**
 * Heuristic: does a note's stored `content` look like rich-text HTML (authored
 * with the editor) versus a legacy plain-text note? Legacy notes are rendered
 * verbatim (whitespace-preserved); HTML is rendered as formatted prose.
 */
export function isRichTextHtml(content?: string | null): boolean {
  return !!content && /<\/?[a-z][\s\S]*>/i.test(content)
}
