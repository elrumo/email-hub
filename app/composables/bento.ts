import type { CardBg, CardStyle, Widget } from '~/types'

/**
 * Tailwind classes for a bento tile's chrome, driven by its per-tile
 * `cardStyle` (and `bg` fill). Shared by the home grid (WidgetTile) and the
 * public /b/<slug> view so both render identically. The `.bento-card` base
 * (rounding + hover lift), the `.bento-elevated` shadow and the
 * `.bento-bg-solid` fill live in app/assets/css/main.css.
 *
 *   - shadow  → soft resting shadow + faint ring (the default bento look)
 *   - outline → ring border only, flat
 *   - none    → no shadow, no ring (flat tile)
 *
 * When `bg === 'solid'`, `bento-bg-solid` is added; the actual light/dark
 * colours come from CSS variables set inline via `bentoCardVars()`.
 */
export function bentoCardClass(style?: CardStyle | null, bg?: CardBg | null): string {
  const base = 'bento-card rounded-3xl'
  let cls: string
  switch (style) {
    case 'outline':
      cls = `${base} ring-1 ring-default`
      break
    case 'none':
      cls = `${base} ring-0`
      break
    case 'shadow':
    default:
      cls = `${base} bento-elevated ring-1 ring-default`
      break
  }
  if (bg === 'solid') cls += ' bento-bg-solid'
  return cls
}

/**
 * Inline CSS custom properties that feed a tile's solid background fill. The
 * `.bento-bg-solid` rule reads `--bento-bg-light` in light theme and
 * `--bento-bg-dark` under `html.dark`, so a tile can carry a different colour
 * per theme. Returns an empty object (no vars) when the tile isn't a solid fill
 * or hasn't picked a colour, so the default card surface shows through.
 */
export function bentoCardVars(
  w: Pick<Widget, 'bg' | 'bgLight' | 'bgDark'>
): Record<string, string> {
  if (w.bg !== 'solid') return {}
  const vars: Record<string, string> = {}
  if (w.bgLight) vars['--bento-bg-light'] = w.bgLight
  // Dark falls back to the light colour when only one was picked.
  if (w.bgDark || w.bgLight) vars['--bento-bg-dark'] = (w.bgDark || w.bgLight) as string
  return vars
}

/**
 * Heuristic: does a note's stored `content` look like rich-text HTML (authored
 * with the editor) versus a legacy plain-text note? Legacy notes are rendered
 * verbatim (whitespace-preserved); HTML is rendered as formatted prose.
 */
export function isRichTextHtml(content?: string | null): boolean {
  return !!content && /<\/?[a-z][\s\S]*>/i.test(content)
}
