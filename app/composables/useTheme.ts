/**
 * Accent-palette themes.
 *
 * Nuxt UI resolves a single, *reactive* app config: the `--ui-color-*` CSS
 * variables are generated from `appConfig.ui.colors`, so mutating that object
 * at runtime re-themes the whole app instantly — no rebuild, no reload, and no
 * need for separate `app.config.ts` files per theme. A "theme" here is just a
 * preset that maps to Tailwind palettes for the primary accent and the neutral
 * chrome. (Light/dark is a separate axis, handled by `UColorModeButton`.)
 */
export interface ThemePreset {
  id: string
  label: string
  /** Tailwind colour used for the brand accent / primary actions. */
  primary: string
  /** Tailwind colour used for chrome: text, surfaces, borders. */
  neutral: string
}

export const themePresets: ThemePreset[] = [
  { id: 'default', label: 'Default', primary: 'blue', neutral: 'neutral' },
  { id: 'emerald', label: 'Emerald', primary: 'emerald', neutral: 'zinc' },
  { id: 'violet', label: 'Violet', primary: 'violet', neutral: 'slate' },
  { id: 'rose', label: 'Rose', primary: 'rose', neutral: 'stone' },
  { id: 'amber', label: 'Amber', primary: 'amber', neutral: 'stone' }
]

export function useTheme() {
  const appConfig = useAppConfig()

  // Persisted in a cookie so the choice survives reloads and is available to
  // the server: the palette is applied during SSR, avoiding a flash of the
  // default colours on first paint.
  const themeId = useCookie<string>('theme', {
    default: () => 'default',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  })

  const current = computed(
    () => themePresets.find(t => t.id === themeId.value) ?? themePresets[0]!
  )

  // Apply the selection to the reactive app config. `immediate` covers the
  // initial value (including during SSR); the watch then tracks any change.
  watch(
    current,
    (preset) => {
      if (!appConfig.ui?.colors) return
      appConfig.ui.colors.primary = preset.primary
      appConfig.ui.colors.neutral = preset.neutral
    },
    { immediate: true }
  )

  function setTheme(id: string) {
    themeId.value = id
  }

  return { themePresets, themeId, current, setTheme }
}
