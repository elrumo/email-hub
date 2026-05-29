/**
 * Schedule model + helpers — the single source of truth for how a cron trigger's
 * `config` turns into a canonical schedule (cron string and/or one-time runAt),
 * how it reads back as a human summary, and when it next fires.
 *
 * A `core.cron` trigger stores its schedule under `trigger.config`:
 *   {
 *     mode: 'cron' | 'interval' | 'at',
 *     cron?: string,          // canonical 5-field cron (recurring)
 *     intervalMs?: number,    // interval mode input (compiled down to cron)
 *     runAt?: number,         // epoch ms (one-time 'at')
 *     timezone?: string,      // IANA tz the cron is evaluated in
 *     builder?: unknown       // verbatim friendly-UI inputs, for round-tripping
 *   }
 *
 * `cron`/`runAt` are the DERIVED canonical values the scheduler reads; the
 * builder/interval inputs are what the UI captured. compileSchedule() turns the
 * latter into the former so the server never has to re-interpret UI state.
 */

export type ScheduleMode = 'cron' | 'interval' | 'at'

export interface ScheduleConfig {
  mode?: ScheduleMode
  cron?: string
  intervalMs?: number
  runAt?: number
  timezone?: string | null
  /** verbatim friendly-UI inputs so the form can reconstruct itself */
  builder?: unknown
  [key: string]: unknown
}

export interface CompiledSchedule {
  cron: string | null
  runAt: number | null
  timezone: string | null
  error?: string
}

// ---------------------------------------------------------------------------
// Timezone-aware wall-clock field extraction
// ---------------------------------------------------------------------------

export interface WallClock {
  minute: number
  hour: number
  /** day of month, 1-31 */
  dom: number
  /** month, 1-12 */
  mon: number
  /** day of week, 0-6 (Sun=0) */
  dow: number
}

const DOW_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
}

/**
 * The wall-clock fields of `date` as observed in `timezone` (IANA). When no
 * timezone is given, falls back to the host's local time (the legacy behavior).
 * Uses Intl so it is DST-correct.
 */
export function wallClockIn(date: Date, timezone?: string | null): WallClock {
  if (!timezone) {
    return {
      minute: date.getMinutes(),
      hour: date.getHours(),
      dom: date.getDate(),
      mon: date.getMonth() + 1,
      dow: date.getDay()
    }
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    minute: '2-digit',
    hour: '2-digit',
    day: '2-digit',
    month: '2-digit',
    weekday: 'short'
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  // hour can come back as "24" at midnight in some environments; normalize.
  const hour = parseInt(get('hour'), 10) % 24
  return {
    minute: parseInt(get('minute'), 10),
    hour,
    dom: parseInt(get('day'), 10),
    mon: parseInt(get('month'), 10),
    dow: DOW_INDEX[get('weekday')] ?? 0
  }
}

// ---------------------------------------------------------------------------
// Cron string helpers (shared with cron.ts matching)
// ---------------------------------------------------------------------------

const FIELD_BOUNDS: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6] // day of week
]

/** Validate a 5-field cron expression. Returns an error string or null. */
export function validateCron(expr: string): string | null {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return 'cron must have exactly 5 fields (min hour dom mon dow)'
  for (let i = 0; i < 5; i++) {
    const [min, max] = FIELD_BOUNDS[i]!
    const field = fields[i]!
    for (const part of field.split(',')) {
      const [rangePart, stepPart] = part.split('/')
      if (stepPart !== undefined && (!/^\d+$/.test(stepPart) || parseInt(stepPart, 10) < 1)) {
        return `invalid step in field ${i + 1}: "${part}"`
      }
      if (rangePart && rangePart !== '*') {
        const bounds = rangePart.split('-')
        if (bounds.length > 2 || bounds.some(b => !/^\d+$/.test(b))) {
          return `invalid range in field ${i + 1}: "${part}"`
        }
        const nums = bounds.map(b => parseInt(b, 10))
        if (nums.some(n => n < min || n > max)) {
          return `value out of range in field ${i + 1} (${min}-${max}): "${part}"`
        }
        if (nums.length === 2 && nums[0]! > nums[1]!) {
          return `reversed range in field ${i + 1}: "${part}"`
        }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Compile UI input -> canonical schedule
// ---------------------------------------------------------------------------

/**
 * Turn a cron trigger's config into the canonical { cron, runAt, timezone } the
 * scheduler reads. Interval/preset modes compile down to a cron string; 'at'
 * mode resolves to a runAt epoch (with cron null). Returns an `error` when the
 * input is unusable.
 */
export function compileSchedule(config: ScheduleConfig | undefined): CompiledSchedule {
  const cfg = config ?? {}
  const timezone = typeof cfg.timezone === 'string' && cfg.timezone.trim() ? cfg.timezone.trim() : null
  if (timezone && !isValidTimezone(timezone)) {
    return { cron: null, runAt: null, timezone: null, error: `unknown timezone: ${timezone}` }
  }
  const mode: ScheduleMode = cfg.mode ?? 'cron'

  if (mode === 'at') {
    const runAt = typeof cfg.runAt === 'number' ? cfg.runAt : NaN
    if (!Number.isFinite(runAt)) {
      return { cron: null, runAt: null, timezone, error: 'pick a date and time to run' }
    }
    return { cron: null, runAt, timezone }
  }

  if (mode === 'interval') {
    const ms = typeof cfg.intervalMs === 'number' ? cfg.intervalMs : NaN
    if (!Number.isFinite(ms) || ms < 60_000) {
      return { cron: null, runAt: null, timezone, error: 'interval must be at least 1 minute' }
    }
    const cron = intervalToCron(ms)
    if (!cron) {
      return { cron: null, runAt: null, timezone, error: 'interval must be a whole number of minutes or hours' }
    }
    return { cron, runAt: null, timezone }
  }

  // 'cron' (presets and advanced both land here as a canonical cron string)
  const expr = typeof cfg.cron === 'string' ? cfg.cron.trim() : ''
  if (!expr) return { cron: null, runAt: null, timezone, error: 'a cron expression is required' }
  const err = validateCron(expr)
  if (err) return { cron: null, runAt: null, timezone, error: err }
  return { cron: expr, runAt: null, timezone }
}

/** Compile an interval in ms to a cron string, or null if it isn't expressible. */
function intervalToCron(ms: number): string | null {
  const minutes = ms / 60_000
  if (!Number.isInteger(minutes)) return null
  if (minutes < 60) {
    if (60 % minutes !== 0) {
      // not a clean divisor of an hour — fall back to a plain every-N-minutes
      // which cron's step still honors within each hour boundary.
      return `*/${minutes} * * * *`
    }
    return `*/${minutes} * * * *`
  }
  const hours = minutes / 60
  if (!Number.isInteger(hours)) return null
  if (hours >= 24) {
    if (hours % 24 === 0) return '0 0 * * *' // daily (or multi-day collapses to daily)
    return null
  }
  return `0 */${hours} * * *`
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Human-readable description + next-run preview
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** A plain-English summary of a compiled schedule. */
export function describeSchedule(compiled: CompiledSchedule): string {
  if (compiled.error) return compiled.error
  const tzSuffix = compiled.timezone ? ` (${compiled.timezone})` : ''
  if (compiled.runAt != null) {
    return `Once at ${formatInstant(compiled.runAt, compiled.timezone)}`
  }
  if (compiled.cron) return describeCron(compiled.cron) + tzSuffix
  return 'No schedule'
}

/** Best-effort English for common cron shapes; falls back to the raw expr. */
export function describeCron(expr: string): string {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return expr
  const [min, hour, dom, mon, dow] = fields as [string, string, string, string, string]

  const everyNMin = min.match(/^\*\/(\d+)$/)
  if (everyNMin && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${everyNMin[1]} minutes`
  }
  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return 'Every minute'
  }
  const everyNHour = hour.match(/^\*\/(\d+)$/)
  if (everyNHour && min === '0' && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${everyNHour[1]} hours`
  }
  // fixed time-of-day
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    if (dom === '*' && mon === '*' && dow === '*') return `Every day at ${time}`
    if (dom === '*' && mon === '*' && /^[0-6](,[0-6])*$/.test(dow)) {
      const days = dow.split(',').map(d => WEEKDAYS[parseInt(d, 10)]).filter(Boolean)
      return `Every ${days.join(', ')} at ${time}`
    }
    if (/^\d+$/.test(dom) && mon === '*' && dow === '*') {
      return `On day ${dom} of every month at ${time}`
    }
    if (/^\d+$/.test(dom) && /^\d+$/.test(mon) && dow === '*') {
      return `On ${MONTHS[parseInt(mon, 10) - 1]} ${dom} at ${time}`
    }
  }
  return expr
}

function formatInstant(epoch: number, timezone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || undefined,
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(epoch)) + (timezone ? ` (${timezone})` : '')
  } catch {
    return new Date(epoch).toISOString()
  }
}

/**
 * The next N fire times at/after `from` (epoch ms). For a one-time runAt this is
 * just [runAt] if it's still in the future. For cron, scans minute-by-minute up
 * to a 1-year horizon. Returns epoch ms values.
 */
export function nextRuns(compiled: CompiledSchedule, from: number, count = 3): number[] {
  if (compiled.error) return []
  if (compiled.runAt != null) {
    return compiled.runAt >= from ? [compiled.runAt] : []
  }
  if (!compiled.cron) return []
  const out: number[] = []
  // start at the next whole minute
  let t = Math.ceil(from / 60_000) * 60_000
  const horizon = from + 366 * 24 * 60 * 60 * 1000
  while (out.length < count && t <= horizon) {
    if (cronMatchesAt(compiled.cron, t, compiled.timezone)) out.push(t)
    t += 60_000
  }
  return out
}

/**
 * Does the cron match the given instant, evaluated in `timezone`? Mirrors the
 * matcher in cron.ts but lives here so nextRuns() and the matcher share the same
 * wall-clock logic. cron.ts re-exports the field-set parser it already owns.
 */
function cronMatchesAt(expr: string, epoch: number, timezone?: string | null): boolean {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const [min, hour, dom, mon, dow] = fields as [string, string, string, string, string]
  const wc = wallClockIn(new Date(epoch), timezone)
  return (
    parseField(min, 0, 59).has(wc.minute)
    && parseField(hour, 0, 23).has(wc.hour)
    && parseField(dom, 1, 31).has(wc.dom)
    && parseField(mon, 1, 12).has(wc.mon)
    && parseField(dow, 0, 6).has(wc.dow)
  )
}

/**
 * Expand a single cron field into the set of matching integers. Supports `*`,
 * lists (1,2,3), ranges (1-5), and steps (*\/5, 1-30/2). Shared with cron.ts.
 */
export function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>()
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/')
    const step = stepPart ? parseInt(stepPart, 10) : 1
    let lo = min
    let hi = max
    if (rangePart && rangePart !== '*') {
      const [a, b] = rangePart.split('-')
      lo = parseInt(a!, 10)
      hi = b !== undefined ? parseInt(b, 10) : lo
    }
    for (let n = lo; n <= hi; n += step) {
      if (n >= min && n <= max) out.add(n)
    }
  }
  return out
}
