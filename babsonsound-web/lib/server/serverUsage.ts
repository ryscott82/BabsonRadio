import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { adminDb } from './admin'
import { cpuState } from './cpuBudget'
import { escapeHtml, mailConfigured, sendMail } from './mailer'
import { ownerEmails } from './access'
import { checkEntryAlerts, alertsFor } from './usageAlerts'
import { buildForecast, cleanEntry, costIntervals, etDate, monthOfDate, reminderDue, type CostPoint, type Forecast, type UsageEntry } from '../serverUsage'
import { statusOf, type UsageStatus } from '../usageBanner'
import { cpuMeterSnapshot } from './cpuMeter'
import { readMeterSnapshot } from './readMeter'
import { tokenCacheStats } from './http'
import { totalsOf, type CpuMinute, type RouteTotal } from '../cpuMeterCore'

// The usage log: what Vercel's Usage page shows, typed in by an admin (collection serverUsage, one document per reading, admin only through
// /api/admin/server-usage). The forecast and the alerts read it together with our own meter.

const col = (db: Firestore) => db.collection('serverUsage')
export interface UsageRow extends UsageEntry { id: string }

const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null) // a field left blank is stored as null
const rowOf = (d: FirebaseFirestore.DocumentSnapshot): UsageRow => ({
  id: d.id, date: String(d.get('date') ?? ''), activeCpuHours: numOrNull(d.get('activeCpuHours')), edgeRequests: numOrNull(d.get('edgeRequests')),
  functionInvocations: numOrNull(d.get('functionInvocations')), fastDataTransferGB: numOrNull(d.get('fastDataTransferGB')), note: String(d.get('note') ?? ''),
  enteredBy: String(d.get('enteredBy') ?? ''), enteredAt: Number(d.get('enteredAt') ?? 0), ...(Array.isArray(d.get('topRoutes')) ? { topRoutes: d.get('topRoutes') } : {}),
})

export async function listUsage(db: Firestore = adminDb(), limit = 200): Promise<UsageRow[]> {
  return (await col(db).orderBy('date', 'desc').limit(limit).get()).docs.map(rowOf)
}

type Result = { ok: true; id: string } | { ok: false; error: string; status: number }

export async function addUsage(db: Firestore, raw: unknown, by: string, now = Date.now()): Promise<Result> {
  const c = cleanEntry(raw)
  if (!c.ok) return { ok: false, error: c.error, status: 400 }
  const ref = col(db).doc()
  await ref.set({ ...c.entry, enteredBy: by, enteredAt: now })
  await afterWrite(db, c.entry.date, now)
  return { ok: true, id: ref.id }
}

export async function editUsage(db: Firestore, id: string, raw: unknown, by: string, now = Date.now()): Promise<Result> {
  const c = cleanEntry(raw)
  if (!c.ok) return { ok: false, error: c.error, status: 400 }
  const ref = col(db).doc(id)
  if (!(await ref.get()).exists) return { ok: false, error: 'That entry no longer exists.', status: 404 }
  // topRoutes is replaced as a whole (left out = removed), the rest are overwritten.
  await ref.set({ ...c.entry, enteredBy: by, enteredAt: now })
  await afterWrite(db, c.entry.date, now)
  return { ok: true, id }
}

export async function deleteUsage(db: Firestore, id: string): Promise<Result> {
  const ref = col(db).doc(id)
  if (!(await ref.get()).exists) return { ok: false, error: 'That entry no longer exists.', status: 404 }
  await ref.delete()
  resetUsageStatus()
  return { ok: true, id }
}

/** A new reading can cross an alert threshold, so look at it right away. */
async function afterWrite(db: Firestore, date: string, now: number) {
  resetUsageStatus()
  try {
    const f = await usageForecast(db, now)
    if (f.fromEntry) {
      await checkEntryAlerts(db, { month: f.month, hours: f.fromEntry.hours, projected: f.fromEntry.projectedMonthEnd, allowance: f.allowanceHours, dayOfMonth: Number(date.slice(8, 10)) })
    }
  } catch (e) { console.error('[usage entry alerts]', e) }
}

/** `rows` are readings the caller already loaded (the overview does), so they are not read twice. */
export async function usageForecast(db: Firestore = adminDb(), now = Date.now(), rows?: UsageRow[]): Promise<Forecast & { alerts: Awaited<ReturnType<typeof alertsFor>> }> {
  const state = await cpuState(db, now)
  const month = state.month
  const [entries, mins, alerts] = await Promise.all([
    rows ? null : col(db).where('date', '>=', `${month}-01`).where('date', '<=', `${month}-31`).get(),
    db.collection('usage').doc(month).get(), // listener-minutes per day (see recordListeners)
    alertsFor(db, month).catch(() => []),
  ])
  const byDay = (mins.get('byDay') ?? {}) as Record<string, number>
  const listenerMinutesByDate: Record<string, number> = {}
  for (const [day, m] of Object.entries(byDay)) listenerMinutesByDate[`${month}-${String(day).padStart(2, '0')}`] = Number(m) || 0
  const f = buildForecast({ month, now, allowanceHours: state.config.budgetHours, meterHours: state.usedHours, entries: entries ? entries.docs.map(rowOf) : rows!.filter(r => monthOfDate(r.date) === month), listenerMinutesByDate })
  return { ...f, alerts }
}

// ── the overview: everything the Server load page shows, in one call ──
const months = (rows: { date: string }[], current: string, max = 6) => [...new Set([current, ...rows.map(r => monthOfDate(r.date))])].sort().reverse().slice(0, max)

export interface Overview {
  now: number
  month: string
  allowanceHours: number
  entries: UsageRow[]
  costs: CostPoint[]
  forecast: Awaited<ReturnType<typeof usageForecast>>
  status: UsageStatus
  meter: { usedHours: number; projectedHours: number; reactionsHours: number; baseHours: number; byMonth: Record<string, Record<string, number>> }
  tiers: Awaited<ReturnType<typeof cpuState>>['tiers']
  pressure: number
  control: { tierLocks: Record<string, string>; auto: boolean; reactionsLocked: boolean; thresholds: Awaited<ReturnType<typeof cpuState>>['config']['thresholds'] }
  alerts: Awaited<ReturnType<typeof alertsFor>>
  routes: { note: string; totals: RouteTotal[]; minutes: CpuMinute[]; tokenCache: { hits: number; misses: number } }
}

/** One call for the whole page: the readings, our meter by day, the forecast, tiers, alert history and the per-route table. Cached state is reused (30 s). */
export async function usageOverview(db: Firestore = adminDb(), now = Date.now()): Promise<Overview> {
  const state = await cpuState(db, now)
  const entries = await listUsage(db)
  const ms = months(entries, state.month)
  const past = ms.filter(m => m !== state.month)
  const [forecast, usageDocs, meterDocs, alerts] = await Promise.all([
    usageForecast(db, now, entries),
    ms.length ? db.getAll(...ms.map(m => db.collection('usage').doc(m))) : Promise.resolve([]),
    past.length ? db.getAll(...past.map(m => db.collection('usage').doc(`cpu-${m}`))) : Promise.resolve([]),
    alertsFor(db, ms.slice(0, 3)).catch(() => []),
  ])
  const minutesByDate: Record<string, number> = {}
  usageDocs.forEach((d, i) => { for (const [day, m] of Object.entries((d.get('byDay') ?? {}) as Record<string, number>)) minutesByDate[`${ms[i]}-${String(day).padStart(2, '0')}`] = Number(m) || 0 })
  const byMonth: Record<string, Record<string, number>> = { [state.month]: state.byDay }
  meterDocs.forEach((d, i) => {
    const per: Record<string, number> = {}
    for (const [day, v] of Object.entries((d.get('d') ?? {}) as Record<string, { total?: number }>)) per[day] = Math.round(((v.total ?? 0) / 3600) * 1000) / 1000
    byMonth[past[i]] = per
  })
  const reads: Record<string, { reads: number }> = {}
  for (const m of readMeterSnapshot()) for (const [k, v] of Object.entries(m.routes)) (reads[k] ??= { reads: 0 }).reads += v.reads
  const minutes = cpuMeterSnapshot()
  const status = statusOf({ forecast, tiers: state.tiers, dayOfMonth: new Date(now).getUTCDate() })
  return {
    now, month: state.month, allowanceHours: state.config.budgetHours, entries, costs: costIntervals(entries, minutesByDate), forecast, status,
    meter: { usedHours: state.usedHours, projectedHours: state.projectedHours, reactionsHours: state.reactionsHours, baseHours: state.config.baseHours, byMonth },
    tiers: state.tiers, pressure: state.pressure,
    control: { tierLocks: Object.fromEntries(Object.entries(state.config.tierLocks).map(([k, v]) => [k, String(v)])), auto: state.config.auto, reactionsLocked: state.config.reactionsLocked, thresholds: state.config.thresholds },
    alerts,
    routes: { note: 'This server instance only. Minutes are UTC. Totals per minute are exact; the split between routes is an estimate.', totals: totalsOf(minutes, reads), minutes, tokenCache: tokenCacheStats() },
  }
}

// ── the small status: the banner on every admin page, and the iOS admin ──
// Kept for 5 minutes per server, so opening several admin pages in a row costs one read of the month, not one per page.
let statusCache: { at: number; v: UsageStatus } | null = null
export const resetUsageStatus = () => { statusCache = null }
export async function usageStatus(db: Firestore = adminDb(), now = Date.now()): Promise<UsageStatus> {
  if (statusCache && now - statusCache.at < 300_000) return statusCache.v
  const state = await cpuState(db, now)
  const forecast = await usageForecast(db, now)
  const v = statusOf({ forecast, tiers: state.tiers, dayOfMonth: new Date(now).getUTCDate() })
  statusCache = { at: now, v }
  return v
}

// ── weekly reminder (runs inside the daily birthdays cron, so no extra cron job is needed) ──
export async function runUsageReminder(now = Date.now()): Promise<{ sent: boolean; reason?: string }> {
  if (!mailConfigured()) return { sent: false, reason: 'mail not set up' }
  const db = adminDb()
  const [last, mark] = await Promise.all([col(db).orderBy('enteredAt', 'desc').limit(1).get(), db.collection('ops').doc('usageReminder').get()])
  const lastEnteredAt = last.docs[0] ? Number(last.docs[0].get('enteredAt') ?? 0) : null
  const lastSentAt = (mark.get('sentAt') as number | undefined) ?? null
  if (!reminderDue({ now, lastEnteredAt, lastSentAt })) return { sent: false, reason: 'not due' }
  const link = 'https://babsonradio.com/admin/server-load'
  const lines = ['Please enter this week\'s Vercel usage: Active CPU hours, edge requests, function invocations and fast data transfer from the Usage page.', 'It takes a minute and keeps the forecast honest.']
  const text = ['Hi,', '', ...lines, '', link, '', 'Babson Radio'].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5"><p>Hi,</p>${
    lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}<p style="margin:28px 0"><a href="${link}" style="background:#006644;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600">Enter usage</a></p><p>Babson Radio</p></div>`
  const owners = ownerEmails()
  const ok = await Promise.all(owners.map(o => sendMail(o, 'Enter this week\'s Vercel usage', text, html)))
  if (ok.some(Boolean)) await db.collection('ops').doc('usageReminder').set({ sentAt: now, date: etDate(now), to: owners.length })
  return { sent: ok.some(Boolean) }
}

export { monthOfDate }
