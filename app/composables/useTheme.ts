/**
 * Visual themes.
 *
 * A theme here is a full visual identity — geometry, surfaces, typography and
 * depth — not just an accent colour. It's driven by three reactive levers, none
 * of which need a separate `app.config.ts`:
 *
 *  1. `appConfig.ui.colors` — the accent (primary) + chrome (neutral) palettes.
 *     Nuxt UI regenerates its `--ui-color-*` variables from this reactively.
 *  2. A `data-theme` attribute on `<html>` — CSS in `assets/css/main.css`
 *     overrides the Nuxt UI design tokens (`--ui-radius`, `--ui-bg*`,
 *     `--ui-text*`, `--ui-border*`, fonts) and adds per-theme flourishes.
 *  3. An optional forced colour `mode` — strong identities (paper, onyx,
 *     carbon…) pin light or dark so the neutral scale matches their surfaces.
 *     Light/dark otherwise stays a free axis via `UColorModeButton`.
 */
export interface ThemePreset {
  id: string
  label: string
  /** Short description shown in the picker. */
  hint: string
  /** Tailwind colour for the brand accent / primary actions. */
  primary: string
  /** Tailwind colour for chrome: text, surfaces, borders. */
  neutral: string
  /** Pin light/dark when the identity demands it; omit to respect the user. */
  mode?: 'light' | 'dark'
  /** CSS background for the picker swatch. */
  swatch: string
  /** Render the swatch as a square (sharp-cornered themes). */
  square?: boolean
}

export const themePresets: ThemePreset[] = [
  {
    id: 'default',
    label: 'Default',
    hint: 'Clean & rounded',
    primary: 'blue',
    neutral: 'neutral',
    swatch: '#2563eb'
  },
  {
    id: 'paper',
    label: 'Paper',
    hint: 'Editorial, ink on paper',
    primary: 'red',
    neutral: 'stone',
    mode: 'light',
    swatch: '#faf8f2',
    square: true
  },
  {
    id: 'skeuo',
    label: 'Skeuomorphic',
    hint: 'Glossy & tactile',
    primary: 'blue',
    neutral: 'slate',
    mode: 'light',
    swatch: 'linear-gradient(180deg, #f7f9fc, #c5cfdd)'
  },
  {
    id: 'onyx',
    label: 'Onyx',
    hint: 'All-black, elegant',
    primary: 'amber',
    neutral: 'neutral',
    mode: 'dark',
    swatch: '#0a0a0a'
  },
  {
    id: 'futuristic',
    label: 'Futuristic',
    hint: 'Neon glass & glow',
    primary: 'cyan',
    neutral: 'slate',
    mode: 'dark',
    swatch: 'radial-gradient(circle at 30% 30%, #4ad8ff, #0b1c4d)'
  },
  {
    id: 'carbon',
    label: 'Carbon',
    hint: 'IBM Carbon Design',
    primary: 'blue',
    neutral: 'gray',
    mode: 'light',
    swatch: 'linear-gradient(135deg, #161616 0 50%, #0f62fe 50% 100%)',
    square: true
  }
]

// Web font for the Carbon theme (IBM Plex). Loaded only while that theme is
// active; everything else uses system stacks declared in the CSS.
const CARBON_FONT_HREF
  = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap'

export function useTheme() {
  const appConfig = useAppConfig()
  const colorMode = useColorMode()

  // Persisted in a cookie so the choice survives reloads and is available to
  // the server: tokens are applied during SSR, avoiding a flash of the
  // default theme on first paint.
  const themeId = useCookie<string>('theme', {
    default: () => 'default',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  })

  const current = computed(
    () => themePresets.find(t => t.id === themeId.value) ?? themePresets[0]!
  )

  // Drive the accent palette and the forced colour mode from the selection.
  // `immediate` covers the initial value (including during SSR); the watch
  // then tracks any change.
  watch(
    current,
    (preset) => {
      if (appConfig.ui?.colors) {
        appConfig.ui.colors.primary = preset.primary
        appConfig.ui.colors.neutral = preset.neutral
      }
      if (preset.mode) colorMode.preference = preset.mode
    },
    { immediate: true }
  )

  // The `data-theme` attribute switches the CSS token overrides; the Carbon
  // font is pulled in only when needed. Both are reactive via the computed.
  useHead(
    computed(() => ({
      htmlAttrs: { 'data-theme': current.value.id },
      link:
        current.value.id === 'carbon'
          ? [{ rel: 'stylesheet', href: CARBON_FONT_HREF }]
          : []
    }))
  )

  function setTheme(id: string) {
    themeId.value = id
  }

  return { themePresets, themeId, current, setTheme }
}
