// The "enter usage" form: turns what an admin types (text) into an entry the server accepts, with a plain message per field. Pure, so the tests run it.
// People copy numbers straight off Vercel's Usage page, so this accepts what that page shows: "1,204,330", "1.2M", "2h 15m", "800 MB".

import { cleanEntry, monthOfDate, validDate, type TopRoute, type UsageEntry } from './serverUsage.ts'

export interface FormRoute { route: string; hours: string }
export interface UsageForm { date: string; cpu: string; edge: string; invocations: string; gb: string; routes: FormRoute[]; note: string }
export type FormField = 'date' | 'cpu' | 'edge' | 'invocations' | 'gb' | 'routes' | 'note'
export type FormErrors = Partial<Record<FormField, string>>

export const emptyForm = (date: string): UsageForm => ({ date, cpu: '', edge: '', invocations: '', gb: '', routes: [], note: '' })

const clean = (s: string) => s.trim().replace(/,/g, '').replace(/\s+/g, ' ')

/** "1.5", "1.5h", "1h 30m", "1h 30m 10s", "90m" -> hours. Null when it is not a time. */
export function parseHours(raw: string): number | null {
  const s = clean(raw).toLowerCase()
  if (!s) return null
  if (/^\d+(\.\d+)?\s*h?$/.test(s)) return Number(s.replace(/h$/, '').trim())
  const m = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/.exec(s)
  if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return null
  return Number(m[1] ?? 0) + Number(m[2] ?? 0) / 60 + Number(m[3] ?? 0) / 3600
}

/** "1204330", "1,204,330", "1.2M", "850K", "2B" -> a count. Null when it is not a number. */
export function parseCount(raw: string): number | null {
  const s = clean(raw).toUpperCase()
  const m = /^(\d+(?:\.\d+)?)\s*([KMB])?$/.exec(s)
  if (!m) return null
  const mult = ({ K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[m[2] ?? ''] ?? 1
  return Math.round(Number(m[1]) * mult)
}

/** "3.2", "3.2 GB", "800 MB", "1.1 TB" -> gigabytes. Null when it is not a size. */
export function parseGB(raw: string): number | null {
  const s = clean(raw).toUpperCase()
  const m = /^(\d+(?:\.\d+)?)\s*(MB|GB|TB)?$/.exec(s)
  if (!m) return null
  const v = Number(m[1])
  return m[2] === 'MB' ? v / 1000 : m[2] === 'TB' ? v * 1000 : v
}

export interface Parsed { ok: boolean; errors: FormErrors; warnings: string[]; entry?: Omit<UsageEntry, 'enteredBy' | 'enteredAt'> }

/**
 * `today` is 'YYYY-MM-DD'. `others` are the readings already saved (leave out the one being edited): a reading lower than an earlier one in the
 * same month gets a warning, not an error, because Vercel's billing period does not start on the 1st.
 */
export function parseForm(f: UsageForm, today: string, others: Pick<UsageEntry, 'date' | 'activeCpuHours'>[] = []): Parsed {
  const errors: FormErrors = {}
  const warnings: string[] = []
  const date = f.date.trim()
  if (!validDate(date)) errors.date = 'Pick a real date, like 2026-11-08.'
  else if (date > nextDay(today)) errors.date = 'That date has not happened yet.'

  const cpu = parseHours(f.cpu)
  if (!f.cpu.trim()) errors.cpu = 'Enter the Active CPU shown on Vercel, like 1.5 or 1h 30m.'
  else if (cpu === null) errors.cpu = 'Use hours like 1.5, or a time like 1h 30m.'
  else if (cpu > 100000) errors.cpu = 'That is more than 100,000 hours. Check the number.'

  const edge = count(f.edge, 'Edge requests', errors, 'edge')
  const inv = count(f.invocations, 'Function invocations', errors, 'invocations')

  const gb = parseGB(f.gb)
  if (!f.gb.trim()) errors.gb = 'Enter the data transfer shown on Vercel, like 3.2 or 800 MB.'
  else if (gb === null) errors.gb = 'Use a size like 3.2, 3.2 GB or 800 MB.'
  else if (gb > 1e7) errors.gb = 'That is too large. Check the number.'

  const topRoutes: TopRoute[] = []
  const seen = new Set<string>()
  f.routes.forEach((r, i) => {
    const route = r.route.trim(), hrs = r.hours.trim()
    if (!route && !hrs) return // an empty row is ignored
    const h = parseHours(r.hours)
    if (!route) { errors.routes ??= `Row ${i + 1}: add the route, like /api/listen.`; return }
    if (route.length > 120) { errors.routes ??= `Row ${i + 1}: the route is too long.`; return }
    if (h === null) { errors.routes ??= `Row ${i + 1}: CPU hours must be a number like 0.4, or a time like 24m.`; return }
    if (seen.has(route)) { errors.routes ??= `Row ${i + 1}: ${route} is listed twice.`; return }
    seen.add(route)
    topRoutes.push({ route, cpuHours: h })
  })
  if (!errors.routes && topRoutes.length > 20) errors.routes = 'List up to 20 routes.'
  if (f.note.trim().length > 500) errors.note = 'The note can be up to 500 characters.'

  if (Object.keys(errors).length) return { ok: false, errors, warnings }

  // Same checks as the server, so a message here is never different from the one the server would give.
  const c = cleanEntry({ date, activeCpuHours: cpu, edgeRequests: edge, functionInvocations: inv, fastDataTransferGB: gb, note: f.note, ...(topRoutes.length ? { topRoutes } : {}) })
  if (!c.ok) return { ok: false, errors: { date: c.error }, warnings }

  const before = others.filter(o => monthOfDate(o.date) === monthOfDate(date) && o.date < date).sort((a, b) => b.date.localeCompare(a.date))[0]
  const after = others.filter(o => monthOfDate(o.date) === monthOfDate(date) && o.date > date).sort((a, b) => a.date.localeCompare(b.date))[0]
  if (before && c.entry.activeCpuHours < before.activeCpuHours) warnings.push(`Lower than the reading on ${before.date} (${round(before.activeCpuHours)} h). Readings add up through the month, so check the number. If Vercel's period started in between, this is fine.`)
  if (after && c.entry.activeCpuHours > after.activeCpuHours) warnings.push(`Higher than the later reading on ${after.date} (${round(after.activeCpuHours)} h). Check the date and the number.`)
  const sum = topRoutes.reduce((a, r) => a + r.cpuHours, 0)
  if (sum > c.entry.activeCpuHours * 1.05 + 0.01) warnings.push('The routes add up to more than the total Active CPU. Check the route hours.')
  return { ok: true, errors, warnings, entry: c.entry }
}

function count(raw: string, label: string, errors: FormErrors, key: 'edge' | 'invocations'): number | null {
  if (!raw.trim()) { errors[key] = `Enter ${label.toLowerCase()} from Vercel, like 1204330 or 1.2M.`; return null }
  const v = parseCount(raw)
  if (v === null) { errors[key] = `${label} must be a number like 1204330 or 1.2M.`; return null }
  if (v > 1e12) { errors[key] = `${label} is too large. Check the number.`; return null }
  return v
}

const round = (n: number) => Math.round(n * 100) / 100
function nextDay(d: string) { return new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) } // a day of slack for time zones

/** An entry back into form text, for editing. */
export function formFromEntry(e: Pick<UsageEntry, 'date' | 'activeCpuHours' | 'edgeRequests' | 'functionInvocations' | 'fastDataTransferGB' | 'note' | 'topRoutes'>): UsageForm {
  return {
    date: e.date, cpu: String(Math.round(e.activeCpuHours * 1000) / 1000),
    edge: String(e.edgeRequests), invocations: String(e.functionInvocations), gb: String(Math.round(e.fastDataTransferGB * 1000) / 1000),
    routes: (e.topRoutes ?? []).map(r => ({ route: r.route, hours: String(Math.round(r.cpuHours * 1000) / 1000) })), note: e.note,
  }
}

/** The four numbers the quick entry asks for. The date is today unless changed. It is the same form as the long one, so the same checks run. */
export interface QuickForm { date: string; cpu: string; edge: string; invocations: string; gb: string }
/** What one press of Save sends: exactly one add, built by the same validation as the full form. Never sent when anything is wrong. */
export function quickSave(q: QuickForm, today: string, others: Parameters<typeof parseForm>[2] = []) {
  const f: UsageForm = { ...emptyForm(q.date), cpu: q.cpu, edge: q.edge, invocations: q.invocations, gb: q.gb }
  const r = parseForm(f, today, others)
  return r.ok && r.entry ? { ok: true as const, body: { action: 'add' as const, ...r.entry }, warnings: r.warnings, errors: r.errors } : { ok: false as const, errors: r.errors, warnings: r.warnings }
}
