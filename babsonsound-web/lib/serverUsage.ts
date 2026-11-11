// The usage log (what Vercel's Usage page shows, typed in by hand) and what we work out from it. Pure, so the tests can run it.
// Entries are readings: each one is the month-to-date number shown on Vercel on that date.

export interface TopRoute { route: string; cpuHours: number }
export interface UsageEntry {
  date: string // YYYY-MM-DD
  activeCpuHours: number
  edgeRequests: number
  functionInvocations: number
  fastDataTransferGB: number
  note: string
  enteredBy: string
  enteredAt: number
  topRoutes?: TopRoute[]
}

export const THRESHOLDS = [50, 75, 90, 100] as const
const DAY = 86_400_000

export const validDate = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
export const monthOfDate = (date: string) => date.slice(0, 7)

type Clean = { ok: true; entry: Omit<UsageEntry, 'enteredBy' | 'enteredAt'> } | { ok: false; error: string }
/** Checks a posted entry. Numbers must be zero or more; anything wrong gives a plain error for the admin. */
export function cleanEntry(raw: unknown): Clean {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!validDate(d.date)) return { ok: false, error: 'Date must be a real day like 2026-11-08.' }
  const num = (k: string, label: string, max: number): number | string => {
    const v = d[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) return `${label} must be a number from 0 to ${max}.`
    return v
  }
  const cpu = num('activeCpuHours', 'Active CPU hours', 100000)
  const edge = num('edgeRequests', 'Edge requests', 1e12)
  const inv = num('functionInvocations', 'Function invocations', 1e12)
  const gb = num('fastDataTransferGB', 'Fast data transfer (GB)', 1e7)
  for (const v of [cpu, edge, inv, gb]) if (typeof v === 'string') return { ok: false, error: v }
  const note = typeof d.note === 'string' ? d.note.trim().slice(0, 500) : ''
  let topRoutes: TopRoute[] | undefined
  if (d.topRoutes !== undefined) {
    if (!Array.isArray(d.topRoutes) || d.topRoutes.length > 20) return { ok: false, error: 'Top routes can list up to 20 routes.' }
    topRoutes = []
    for (const r of d.topRoutes) {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
      if (typeof o.route !== 'string' || !o.route.trim() || o.route.length > 120 || typeof o.cpuHours !== 'number' || !Number.isFinite(o.cpuHours) || o.cpuHours < 0) {
        return { ok: false, error: 'Each top route needs a route name and CPU hours (0 or more).' }
      }
      topRoutes.push({ route: o.route.trim(), cpuHours: o.cpuHours })
    }
  }
  return { ok: true, entry: { date: d.date, activeCpuHours: cpu as number, edgeRequests: edge as number, functionInvocations: inv as number, fastDataTransferGB: gb as number, note, ...(topRoutes ? { topRoutes } : {}) } }
}

export const daysInMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() }

export interface Projection { hours: number; pct: number; perDay: number; projectedMonthEnd: number; daysUntilExhausted: number | null }
/** `elapsedDays` is how much of the month the `hours` cover. */
export function project(hours: number, elapsedDays: number, month: string, allowance: number): Projection {
  const elapsed = Math.max(0.5, elapsedDays)
  const perDay = hours / elapsed
  const left = allowance - hours
  return {
    hours, pct: allowance > 0 ? (hours / allowance) * 100 : 0, perDay,
    projectedMonthEnd: perDay * daysInMonth(month),
    daysUntilExhausted: left <= 0 ? 0 : perDay > 0 ? left / perDay : null,
  }
}

export interface Forecast {
  month: string
  allowanceHours: number
  fromEntry: (Projection & { date: string }) | null
  fromMeter: Projection
  /** The projection to act on: the entered number when there is one this month (it is what Vercel counts), otherwise our meter. */
  projectedMonthEnd: number
  daysUntilExhausted: number | null
  costPerListenerHour: { cpuSeconds: number; listenerHours: number; cpuHours: number; fromDate: string; toDate: string } | null
}

/**
 * Month to date, projected month end, days left at the current rate, and CPU per listener-hour.
 * `listenerMinutesByDate` is listener-minutes per day ('YYYY-MM-DD'), from the listener counter.
 * Cost per listener-hour compares the CPU hours added between the two latest entries with the listener-hours over the same dates; with
 * only one entry it uses the month so far.
 */
export function buildForecast(o: {
  month: string; now: number; allowanceHours: number; meterHours: number; entries: Pick<UsageEntry, 'date' | 'activeCpuHours'>[]
  listenerMinutesByDate: Record<string, number>
}): Forecast {
  const d = new Date(o.now)
  const today = d.toISOString().slice(0, 10)
  const inMonth = o.entries.filter(e => monthOfDate(e.date) === o.month).sort((a, b) => a.date.localeCompare(b.date))
  const latest = inMonth[inMonth.length - 1] ?? null
  const dom = Number(today.slice(8, 10))
  const meterElapsed = monthOfDate(today) === o.month ? dom - 1 + d.getUTCHours() / 24 : daysInMonth(o.month)
  const fromMeter = project(o.meterHours, meterElapsed, o.month, o.allowanceHours)
  const fromEntry = latest ? { date: latest.date, ...project(latest.activeCpuHours, Number(latest.date.slice(8, 10)), o.month, o.allowanceHours) } : null
  const primary = fromEntry ?? fromMeter

  let cost: Forecast['costPerListenerHour'] = null
  if (latest) {
    const prev = inMonth.length > 1 ? inMonth[inMonth.length - 2] : null
    const fromDate = prev ? prev.date : `${o.month}-00`
    const cpu = latest.activeCpuHours - (prev?.activeCpuHours ?? 0)
    let minutes = 0
    for (const [date, m] of Object.entries(o.listenerMinutesByDate)) if (date > fromDate && date <= latest.date) minutes += m
    const hours = minutes / 60
    if (cpu >= 0 && hours > 0) cost = { cpuSeconds: (cpu * 3600) / hours, listenerHours: hours, cpuHours: cpu, fromDate: prev ? prev.date : `${o.month}-01`, toDate: latest.date }
  }
  return { month: o.month, allowanceHours: o.allowanceHours, fromEntry, fromMeter, projectedMonthEnd: primary.projectedMonthEnd, daysUntilExhausted: primary.daysUntilExhausted, costPerListenerHour: cost }
}

/**
 * Which alerts to send now. `fired` are the thresholds already sent this month. If the month jumped past several at once, only the highest
 * is announced and the lower ones are marked as done, so nobody gets three emails for one jump.
 */
export function thresholdsToFire(pct: number, fired: number[]): { announce: number | null; mark: number[] } {
  const crossed = THRESHOLDS.filter(t => pct >= t && !fired.includes(t))
  return { announce: crossed.length ? crossed[crossed.length - 1] : null, mark: [...crossed] }
}

/** Alert if the projected month end passes the allowance, but not on the first days of a month, when one busy day can look like a trend. */
export const projectedOver = (projectedMonthEnd: number, allowance: number, dayOfMonth: number) => dayOfMonth >= 3 && allowance > 0 && projectedMonthEnd > allowance

// ── weekly reminder ──
export const etWeekday = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date(ms))
export const etDate = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms))

/** Monday (Eastern), and no entry made and no reminder sent in the last 6 days. */
export function reminderDue(o: { now: number; lastEnteredAt: number | null; lastSentAt: number | null }): boolean {
  if (etWeekday(o.now) !== 'Mon') return false
  if (o.lastEnteredAt && o.now - o.lastEnteredAt < 6 * DAY) return false
  if (o.lastSentAt && o.now - o.lastSentAt < 6 * DAY) return false
  return true
}

// ── cost per listener-hour over time ──
export interface CostPoint { fromDate: string; toDate: string; cpuHours: number; listenerHours: number; cpuSecondsPerListenerHour: number }
/**
 * One point per reading: the CPU hours added since the reading before it (in the same month; the first reading of a month counts from the 1st)
 * divided by the listener-hours on the days after that reading up to this one. `minutesByDate` is listener-minutes per 'YYYY-MM-DD'.
 * Readings with no listeners, or a number that went down (a new billing period), give no point. Oldest first.
 */
export function costIntervals(entries: (Pick<UsageEntry, 'date' | 'activeCpuHours'> & { enteredAt?: number })[], minutesByDate: Record<string, number>): CostPoint[] {
  const byDate = new Map<string, Pick<UsageEntry, 'date' | 'activeCpuHours'> & { enteredAt?: number }>()
  for (const e of entries) { // one reading a day: the one entered last wins
    const cur = byDate.get(e.date)
    if (!cur || (e.enteredAt ?? 0) >= (cur.enteredAt ?? 0)) byDate.set(e.date, e)
  }
  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  const out: CostPoint[] = []
  let prev: typeof sorted[number] | null = null
  for (const e of sorted) {
    const month = monthOfDate(e.date)
    const base = prev && monthOfDate(prev.date) === month ? prev : null
    prev = e
    const cpu = e.activeCpuHours - (base?.activeCpuHours ?? 0)
    const after = base ? base.date : `${month}-00`
    let minutes = 0
    for (const [date, m] of Object.entries(minutesByDate)) if (date > after && date <= e.date) minutes += m
    const hours = minutes / 60
    if (cpu < 0 || !(hours > 0)) continue
    out.push({ fromDate: base ? base.date : `${month}-01`, toDate: e.date, cpuHours: cpu, listenerHours: hours, cpuSecondsPerListenerHour: (cpu * 3600) / hours })
  }
  return out
}

/** CPU seconds per listener-hour over a set of points (total CPU over total listener-hours, so a quiet stretch does not swing it). */
export function overallCost(points: CostPoint[]): number | null {
  const cpu = points.reduce((a, p) => a + p.cpuHours, 0), lh = points.reduce((a, p) => a + p.listenerHours, 0)
  return lh > 0 ? (cpu * 3600) / lh : null
}
