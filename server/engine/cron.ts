/**
 * Minimal 5-field cron matcher (min hour dom mon dow). Supports: *, lists
 * (1,2,3), ranges (1-5), steps (*\/5, 1-30/2). No seconds, no names. Good
 * enough for scheduling flows; the scheduler calls cronDue() once per tick.
 */
function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    let lo = min;
    let hi = max;
    if (rangePart && rangePart !== "*") {
      const [a, b] = rangePart.split("-");
      lo = parseInt(a!, 10);
      hi = b !== undefined ? parseInt(b, 10) : lo;
    }
    for (let n = lo; n <= hi; n += step) {
      if (n >= min && n <= max) out.add(n);
    }
  }
  return out;
}

export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [min, hour, dom, mon, dow] = fields;
  return (
    parseField(min!, 0, 59).has(date.getMinutes()) &&
    parseField(hour!, 0, 23).has(date.getHours()) &&
    parseField(dom!, 1, 31).has(date.getDate()) &&
    parseField(mon!, 1, 12).has(date.getMonth() + 1) &&
    parseField(dow!, 0, 6).has(date.getDay())
  );
}

/**
 * Due if the cron matches the current minute AND we haven't already run within
 * this same minute (lastRunAt guards against multiple ticks per minute).
 */
export function cronDue(expr: string, now: number, lastRunAt: number | null): boolean {
  const d = new Date(now);
  if (!cronMatches(expr, d)) return false;
  if (lastRunAt == null) return true;
  // same minute already handled?
  const lastMinute = Math.floor(lastRunAt / 60000);
  const nowMinute = Math.floor(now / 60000);
  return nowMinute > lastMinute;
}
