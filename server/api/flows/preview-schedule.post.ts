import { compileSchedule, describeSchedule, nextRuns, type ScheduleConfig } from '../../engine/schedule'

/**
 * Preview a schedule without saving it. The schedule builder POSTs a trigger's
 * ScheduleConfig and gets back the human summary, the compiled cron, and the
 * next few fire times — so the UI never has to reimplement the cron math.
 *
 * Body: { config: ScheduleConfig }
 * Returns: { ok, summary, cron, runAt, timezone, nextRuns: number[], error? }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = (body?.config ?? {}) as ScheduleConfig
  const compiled = compileSchedule(config)
  const summary = describeSchedule(compiled)
  const runs = compiled.error ? [] : nextRuns(compiled, Date.now(), 3)
  return {
    ok: !compiled.error,
    error: compiled.error ?? null,
    summary,
    cron: compiled.cron,
    runAt: compiled.runAt,
    timezone: compiled.timezone,
    nextRuns: runs
  }
})
