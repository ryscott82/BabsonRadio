// Predicts the rest of the month's listener-hours from what past hours looked like. Pure functions (no database),
// so the model can be tested on its own. Used by lib/server/forecastUsage.ts.
//
// For a future hour on weekday D at clock hour H airing content C:
//   prediction = baseline(D, H) x lift(C) x level
//   baseline  how many people usually listen on that weekday and hour, recent weeks weighing more (half-life 3 weeks);
//             hours with few past samples borrow from the same hour on other weekdays.
//   lift      how much more or less C draws than a normal hour in the same spots, pulled toward 1 until C has aired enough.
//   level     how the last 7 days compare with what the model would have said, so growth (or a slump) carries forward.
// The spread comes from backtesting: each of the last days is predicted using only the data before it.

export interface Rec { hourStart: number; dow: number; hour: number; label: string; listenerMin: number; observedMin: number }
export interface Slot { hourStart: number; dow: number; hour: number; label: string }

const HOUR = 3_600_000, DAY = 86_400_000
const HALF_LIFE_WEEKS = 3
const MIN_OBSERVED_MIN = 15
const LIFT_PRIOR_HOURS = 6
const Z80 = 0.84

export const normLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

interface Obs { hourStart: number; dow: number; hour: number; label: string; L: number }

/** Average listeners per hour slot (several records in one hour are combined, weighted by how long each was watched). */
function toObs(recs: Rec[]): Obs[] {
  const byHour = new Map<number, { dow: number; hour: number; listenerMin: number; observedMin: number; labels: Map<string, number> }>()
  for (const r of recs) {
    const h = byHour.get(r.hourStart) ?? { dow: r.dow, hour: r.hour, listenerMin: 0, observedMin: 0, labels: new Map() }
    h.listenerMin += r.listenerMin; h.observedMin += r.observedMin
    const k = normLabel(r.label)
    h.labels.set(k, (h.labels.get(k) ?? 0) + r.observedMin)
    byHour.set(r.hourStart, h)
  }
  const out: Obs[] = []
  for (const [hourStart, h] of byHour) {
    if (h.observedMin < MIN_OBSERVED_MIN) continue
    let label = '', best = -1
    for (const [k, m] of h.labels) if (m > best) { best = m; label = k }
    out.push({ hourStart, dow: h.dow, hour: h.hour, label, L: h.listenerMin / h.observedMin })
  }
  return out
}

export interface Model {
  predict: (s: Slot) => number
  lifts: Map<string, { lift: number; hours: number; avg: number }>
  level: number
  days: number
  hours: number
}

export function buildModel(recs: Rec[], now: number): Model {
  const obs = toObs(recs)
  const wt = (o: Obs) => Math.pow(0.5, Math.max(0, now - o.hourStart) / (7 * DAY) / HALF_LIFE_WEEKS)
  const days = new Set(obs.map(o => Math.floor(o.hourStart / DAY))).size

  let sw = 0, sl = 0
  const cell = new Map<string, { w: number; l: number }>(), hourOnly = new Map<number, { w: number; l: number }>()
  for (const o of obs) {
    const w = wt(o)
    sw += w; sl += w * o.L
    const c = cell.get(`${o.dow}:${o.hour}`) ?? { w: 0, l: 0 }; c.w += w; c.l += w * o.L; cell.set(`${o.dow}:${o.hour}`, c)
    const hh = hourOnly.get(o.hour) ?? { w: 0, l: 0 }; hh.w += w; hh.l += w * o.L; hourOnly.set(o.hour, hh)
  }
  const global = sw > 0 ? sl / sw : 0
  const hourMean = (h: number) => { const x = hourOnly.get(h); return x && x.w > 0 ? x.l / x.w : global }
  const baseline = (dow: number, hour: number) => {
    const c = cell.get(`${dow}:${hour}`) ?? { w: 0, l: 0 }
    const k = 1   // one "virtual" observation of the same hour on other days
    return (c.l + k * hourMean(hour)) / (c.w + k)
  }

  // Content lift: actual / baseline over the hours a label aired, shrunk toward 1.
  const acc = new Map<string, { w: number; l: number; b: number; n: number; raw: number }>()
  for (const o of obs) {
    const w = wt(o), a = acc.get(o.label) ?? { w: 0, l: 0, b: 0, n: 0, raw: 0 }
    a.w += w; a.l += w * o.L; a.b += w * baseline(o.dow, o.hour); a.n += 1; a.raw += o.L
    acc.set(o.label, a)
  }
  const lifts = new Map<string, { lift: number; hours: number; avg: number }>()
  for (const [label, a] of acc) {
    const raw = a.b > 0 ? a.l / a.b : 1
    const lift = Math.max(0.3, Math.min(3, (a.w * raw + LIFT_PRIOR_HOURS) / (a.w + LIFT_PRIOR_HOURS)))
    lifts.set(label, { lift, hours: a.n, avg: a.raw / a.n })
  }
  const base = (s: Slot) => baseline(s.dow, s.hour) * (lifts.get(normLabel(s.label))?.lift ?? 1)

  // Level: the last 7 days against what the model would have predicted for them.
  const recent = obs.filter(o => now - o.hourStart <= 7 * DAY)
  let act = 0, pred = 0
  for (const o of recent) { act += o.L; pred += base(o) }
  const n = recent.length
  const rawLevel = pred > 0 ? act / pred : 1
  const level = Math.max(0.5, Math.min(2, (n * rawLevel + 24) / (n + 24)))

  return { predict: s => Math.max(0, base(s) * level), lifts, level, days, hours: obs.length }
}

export interface Forecast {
  mode: 'history' | 'pace'
  /** Listener-hours still to come this month: the expected amount and a "probably not more than" (80th percentile). */
  remaining: number
  remainingP80: number
  /** Typical error of a day's prediction, as a fraction (from backtesting). */
  sigma: number
  historyDays: number
  level: number
  lifts: { label: string; lift: number; hours: number; avg: number }[]
}

/** Spread of the model's daily error, from predicting each of the last days using only the data before it. */
function backtest(recs: Rec[], now: number): number {
  const obs = toObs(recs)
  const dayStarts = [...new Set(obs.map(o => Math.floor(o.hourStart / DAY) * DAY))].sort((a, b) => a - b).filter(d => d + DAY <= now).slice(-14)
  const errs: number[] = []
  for (const d of dayStarts) {
    const before = recs.filter(r => r.hourStart < d)
    if (new Set(before.map(r => Math.floor(r.hourStart / DAY))).size < 7) continue
    const m = buildModel(before, d)
    const todays = obs.filter(o => o.hourStart >= d && o.hourStart < d + DAY)
    if (todays.length < 12) continue
    const actual = todays.reduce((s, o) => s + o.L, 0)
    const predicted = todays.reduce((s, o) => s + m.predict(o), 0)
    errs.push((actual - predicted) / Math.max(predicted, 1))
  }
  if (errs.length < 4) return 0.5
  const mean = errs.reduce((s, e) => s + e, 0) / errs.length
  const sd = Math.sqrt(errs.reduce((s, e) => s + (e - mean) ** 2, 0) / (errs.length - 1))
  // Include the average miss too, so a model that is steadily off doesn't look more certain than it is.
  return Math.max(0.15, Math.min(0.6, Math.sqrt(sd * sd + mean * mean)))
}

/**
 * recs: past hourly records. future: one slot per remaining hour of the month (with what is scheduled).
 * used and elapsedDays are for the pace fallback while there is not enough history.
 */
export function forecastRemaining(recs: Rec[], future: Slot[], now: number, used: number, elapsedDays: number, remainingDays: number): Forecast {
  const model = buildModel(recs, now)
  if (model.days < 7 || model.hours < 72) {
    const perDay = elapsedDays > 0 ? used / Math.max(elapsedDays, 1) : 0
    const remaining = perDay * remainingDays
    const sigma = 0.5
    return { mode: 'pace', remaining, remainingP80: remaining * (1 + Z80 * sigma), sigma, historyDays: model.days, level: 1, lifts: [] }
  }
  const sigma = backtest(recs, now)
  const perDay = new Map<number, number>()
  for (const s of future) {
    const d = Math.floor(s.hourStart / DAY)
    perDay.set(d, (perDay.get(d) ?? 0) + model.predict(s))
  }
  let remaining = 0, variance = 0
  for (const v of perDay.values()) { remaining += v; variance += (sigma * v) ** 2 }
  const lifts = [...model.lifts].map(([label, v]) => ({ label, ...v })).filter(l => l.hours >= 3).sort((a, b) => b.avg - a.avg)
  return { mode: 'history', remaining, remainingP80: remaining + Z80 * Math.sqrt(variance), sigma, historyDays: model.days, level: model.level, lifts }
}

export { HOUR, DAY }
