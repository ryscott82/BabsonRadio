import { nyParts } from './slotAuto.ts'

// Popular times, pure. Built from what the site already records every hour (usageHours: listener-minutes per hour per show or playlist label) and
// the past approved shows. Only averages are saved: one number per hour of the week (7 x 24, station time, Sunday first) per category.
export const POPULAR_WEEKS = 8
export const REBUILD_MS = 7 * 86_400_000
export const MIN_SHOWS = 3
export const HOURS = 168

export interface PastShow { category: string; title: string; startAt: number; endAt: number }
export interface HourRecord { hourStart: number; label: string; listenerMin: number }
export interface PopularDoc { builtAt: number; weeks: number; station: (number | null)[]; categories: Record<string, { shows: number; cells: (number | null)[] }>; shows: number }

/** Same cleanup the hourly records use for their labels (lowercase, letters and digits, single spaces). */
export const normLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const hourIndex = (ms: number) => { const p = nyParts(ms); return p.dow * 24 + p.h }

export const shouldRebuild = (builtAt: number | null | undefined, now: number) => !builtAt || now - builtAt >= REBUILD_MS

/**
 * station[h]: average listeners in that hour of the week over the records (listener-minutes in an hour / 60), null when there was no record.
 * categories[c].cells[h]: the average over the shows of that category airing in that hour. A category with fewer than 3 shows keeps no cells of its own
 * (the reader falls back to station-wide), and so does an hour of the week none of its shows aired in.
 */
export function buildPopular(shows: PastShow[], records: HourRecord[], now: number): PopularDoc {
  const sum = new Array<number>(HOURS).fill(0), seen = Array.from({ length: HOURS }, () => new Set<number>())
  const byLabelHour = new Map<string, number>() // `${label}|${hourStart}` -> listener-minutes
  for (const r of records) {
    const i = hourIndex(r.hourStart)
    sum[i] += r.listenerMin; seen[i].add(r.hourStart)
    const k = `${normLabel(r.label)}|${r.hourStart}`
    byLabelHour.set(k, (byLabelHour.get(k) ?? 0) + r.listenerMin)
  }
  const station = sum.map((s, i) => (seen[i].size ? Math.round((s / seen[i].size / 60) * 100) / 100 : null))

  const cats: Record<string, { total: number[]; n: number[]; shows: number }> = {}
  for (const s of shows) {
    const c = (cats[s.category || 'other'] ??= { total: new Array(HOURS).fill(0), n: new Array(HOURS).fill(0), shows: 0 })
    c.shows++
    const label = normLabel(s.title)
    for (let t = Math.floor(s.startAt / 3_600_000) * 3_600_000; t < s.endAt; t += 3_600_000) {
      const lm = byLabelHour.get(`${label}|${t}`)
      if (lm === undefined) continue
      const i = hourIndex(t)
      c.total[i] += lm / 60; c.n[i]++
    }
  }
  const categories: PopularDoc['categories'] = {}
  for (const [name, c] of Object.entries(cats)) {
    categories[name] = { shows: c.shows, cells: c.shows < MIN_SHOWS ? new Array(HOURS).fill(null) : c.total.map((t, i) => (c.n[i] ? Math.round((t / c.n[i]) * 100) / 100 : null)) }
  }
  return { builtAt: now, weeks: POPULAR_WEEKS, station, categories, shows: shows.length }
}

/** The 168 numbers to show for a category: its own where it has them, otherwise the station-wide average for that hour. */
export function cellsFor(doc: PopularDoc, category: string | null): { cells: number[]; fallback: boolean; sample: number } {
  const own = category ? doc.categories[category] : undefined
  const cells = Array.from({ length: HOURS }, (_, i) => own?.cells[i] ?? doc.station[i] ?? 0)
  const usesOwn = !!own && own.cells.some(v => v !== null)
  return { cells, fallback: !usesOwn, sample: own?.shows ?? doc.shows }
}

/** 0 to 3 for the shading: none, light, medium, strong (relative to the busiest hour). */
export function gridLevels(cells: number[]): number[][] {
  const max = Math.max(0, ...cells)
  const level = (v: number) => (max <= 0 || v <= 0 ? 0 : v >= max * 0.75 ? 3 : v >= max * 0.4 ? 2 : 1)
  return Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => level(cells[d * 24 + h])))
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h % 24 < 12 ? ' am' : ' pm'}`
export const windowLabel = (day: number, start: number, end: number) => {
  const a = clock(start), b = clock(end)
  const same = a.slice(-2) === b.slice(-2)
  return `${DAY[day]} ${same ? a.slice(0, -3) : a}-${b}`
}

/** The best two-hour windows (up to `n`, none overlapping), as { day, startHour, endHour, avg, label }. */
export function topWindows(cells: number[], n = 3, len = 2) {
  const all: { day: number; startHour: number; endHour: number; avg: number; label: string }[] = []
  for (let d = 0; d < 7; d++) for (let h = 0; h + len <= 24; h++) {
    const avg = cells.slice(d * 24 + h, d * 24 + h + len).reduce((a, b) => a + b, 0) / len
    if (avg > 0) all.push({ day: d, startHour: h, endHour: h + len, avg: Math.round(avg * 100) / 100, label: windowLabel(d, h, h + len) })
  }
  all.sort((a, b) => b.avg - a.avg)
  const out: typeof all = []
  for (const w of all) {
    if (out.length >= n) break
    if (out.some(o => o.day === w.day && o.startHour < w.endHour && w.startHour < o.endHour)) continue
    out.push(w)
  }
  return out
}
