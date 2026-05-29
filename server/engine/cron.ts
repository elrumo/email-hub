/**
 * Minimal 5-field cron matcher (min hour dom mon dow). Supports: *, lists
 * (1,2,3), ranges (1-5), steps (*\/5, 1-30/2). No seconds, no names. Good
 * enough for scheduling flows; the scheduler calls cronDue() once per tick.
 *
 * Field parsing and timezone-aware wall-clock extraction live in schedule.ts so
 * the matcher and the next-run preview share identical semantics.
 */
import { parseField, wallClockIn } from './schedule'

export function cronMatches(expr: string, date: Date, timezone?: string | null): boolean {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const [min, hour, dom, mon, dow] = fields
  const wc = wallClockIn(date, timezone)
  return (
    parseField(min!, 0, 59).has(wc.minute)
    && parseField(hour!, 0, 23).has(wc.hour)
    && parseField(dom!, 1, 31).has(wc.dom)
    && parseField(mon!, 1, 12).has(wc.mon)
    && parseField(dow!, 0, 6).has(wc.dow)
  )
}

/**
 * Due if the cron matches the current minute (in `timezone`) AND we haven't
 * already run within this same minute (lastRunAt guards against multiple ticks
 * per minute).
 */
export function cronDue(expr: string, now: number, lastRunAt: number | null, timezone?: string | null): boolean {
  const d = new Date(now)
  if (!cronMatches(expr, d, timezone)) return false
  if (lastRunAt == null) return true
  // same minute already handled?
  const lastMinute = Math.floor(lastRunAt / 60000)
  const nowMinute = Math.floor(now / 60000)
  return nowMinute > lastMinute
}
