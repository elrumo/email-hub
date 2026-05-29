/**
 * A shortcut's `icon` can be either an iconify/lucide name (e.g. `i-lucide-link`)
 * rendered via <UIcon>, or an absolute image URL (a fetched favicon) rendered
 * via <img>. This tells the two apart so callers can pick the right element.
 */
export function isImageIcon(icon: string | null | undefined): icon is string {
  return !!icon && /^https?:\/\//i.test(icon)
}
