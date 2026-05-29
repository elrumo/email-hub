import type { BadgeProps } from '@nuxt/ui'

export function relTime(ts: number | null | undefined): string {
  if (!ts) return 'never'
  const d = Date.now() - ts
  if (d < 5_000) return 'just now'
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

export function cooldownText(
  lastSwitch: number | null | undefined,
  cooldownMs: number
): string {
  if (!lastSwitch) return 'ready'
  const remaining = lastSwitch + cooldownMs - Date.now()
  if (remaining <= 0) return 'ready'
  if (remaining < 60_000) return `${Math.ceil(remaining / 1000)}s remaining`
  return `${Math.ceil(remaining / 60_000)}m remaining`
}

type StatusColor = BadgeProps['color']

export interface StatusLabel {
  label: string
  cls: string
  color: StatusColor
}

export const STATUS_LABELS: Record<number, StatusLabel> = {
  0: { label: 'DOWN', cls: 'down', color: 'error' },
  1: { label: 'UP', cls: 'up', color: 'success' },
  2: { label: 'PENDING', cls: 'pending', color: 'warning' },
  3: { label: 'MAINTENANCE', cls: 'maintenance', color: 'info' }
}
export const UNKNOWN: StatusLabel = { label: 'UNKNOWN', cls: 'unknown', color: 'neutral' }
