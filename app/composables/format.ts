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

const SUMMARY_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SUMMARY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Plain-English label for a cron expression. Mirrors describeCron() in
 * server/engine/schedule.ts for common shapes; falls back to the raw string.
 */
export function describeCron(expr: string): string {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return expr
  const [min, hour, dom, mon, dow] = fields as [string, string, string, string, string]
  const everyNMin = min.match(/^\*\/(\d+)$/)
  if (everyNMin && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `Every ${everyNMin[1]} minutes`
  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every minute'
  const everyNHour = hour.match(/^\*\/(\d+)$/)
  if (everyNHour && min === '0' && dom === '*' && mon === '*' && dow === '*') return `Every ${everyNHour[1]} hours`
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    if (dom === '*' && mon === '*' && dow === '*') return `Every day at ${time}`
    if (dom === '*' && mon === '*' && /^[0-6](,[0-6])*$/.test(dow)) {
      const days = dow.split(',').map(d => SUMMARY_WEEKDAYS[+d]).filter(Boolean)
      return `Every ${days.join(', ')} at ${time}`
    }
    if (/^\d+$/.test(dom) && mon === '*' && dow === '*') return `On day ${dom} of every month at ${time}`
    if (/^\d+$/.test(dom) && /^\d+$/.test(mon) && dow === '*') return `On ${SUMMARY_MONTHS[+mon - 1]} ${dom} at ${time}`
  }
  return expr
}

/** A human schedule label for a flow's denormalized cron/runAt/timezone. */
export function scheduleSummary(
  flow: { cron?: string | null, runAt?: number | null, timezone?: string | null }
): string {
  const tz = flow.timezone ? ` (${flow.timezone})` : ''
  if (flow.runAt != null) {
    const when = new Date(flow.runAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    return `Once at ${when}${tz}`
  }
  if (flow.cron) return `${describeCron(flow.cron)}${tz}`
  return 'Schedule'
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
