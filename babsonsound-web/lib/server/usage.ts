import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { loadConfig } from './autoschedule'
import { localDate, localToUtc } from './tz'
import { localParts } from '../autoschedule'
import { normLabel } from '../forecast'
import { forecastUsage } from './forecastUsage'
import { notifyAdmins } from './push'
import { loadLimits } from './listenLimits'

// The station's hosting plan allows a fixed number of listener-hours a month (1,500). This module counts them
// (listeners on the stream x time, sampled whenever now-playing is checked) and works out how tight things are,
// so the player can tighten its timeouts before the month runs out.

export interface UsageConfig {
  limitHours: number
  quietEnabled: boolean
  /** Local hours, e.g. 2 and 6: no auto DJ listening from 2:00 to 6:00 unless a show is on. */
  quietStart: number
  quietEnd: number
  guestAutoMin: number
}
export const DEFAULT_USAGE: UsageConfig = { limitHours: 1500, quietEnabled: true, quietStart: 2, quietEnd: 6, guestAutoMin: 15 }

export async function loadUsageConfig(db: Firestore): Promise<UsageConfig> {
  const s = await db.collection('usage').doc('config').get()
  const d = s.data() ?? {}
  const n = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : def)
  return {
    limitHours: n(d.limitHours, DEFAULT_USAGE.limitHours, 1, 100000),
    quietEnabled: d.quietEnabled !== false,
    quietStart: n(d.quietStart, DEFAULT_USAGE.quietStart, 0, 23),
    quietEnd: n(d.quietEnd, DEFAULT_USAGE.quietEnd, 0, 23),
    guestAutoMin: n(d.guestAutoMin, DEFAULT_USAGE.guestAutoMin, 0, 600),
  }
}

const monthKey = (ms: number, tz: string) => { const [y, m] = localDate(ms, tz); return `${y}-${String(m).padStart(2, '0')}` }

let lastSample = 0
/** Adds listeners x time since the last sample to this month's total. Cheap to call often: it samples at most every 30 s. */
export async function recordListeners(db: Firestore, listeners: number, label: string, now = Date.now()): Promise<void> {
  if (now - lastSample < 30_000) return
  lastSample = now
  const cfg = await loadConfig(db)
  const uc = await loadUsageConfig(db)
  const key = monthKey(now, cfg.timezone)
  const ref = db.collection('usage').doc(key)
  const day = String(localDate(now, cfg.timezone)[2])
  // Also kept per hour and per show/genre: that history is what the forecast learns from (see forecast.ts).
  const lp = localParts(now, cfg.timezone)
  const hourStart = localToUtc(lp.y, lp.m, lp.d, Math.floor(lp.minutes / 60) * 60, cfg.timezone)
  const slug = normLabel(label).replace(/ /g, '-').slice(0, 40) || 'unknown'
  const hourRef = db.collection('usageHours').doc(`${hourStart}_${slug}`)
  const total = await db.runTransaction(async tx => {
    const s = await tx.get(ref)
    const last = (s.get('lastAt') as number | undefined) ?? 0
    if (last && now - last < 20_000) return null
    const dt = last ? Math.min(now - last, 5 * 60_000) : 0
    const add = Math.max(0, listeners) * dt / 60_000
    if (dt > 0) tx.set(hourRef, { hourStart, dow: lp.dow, hour: Math.floor(lp.minutes / 60), label: normLabel(label), listenerMin: FieldValue.increment(add), observedMin: FieldValue.increment(dt / 1) }, { merge: true })
    tx.set(ref, { minutes: FieldValue.increment(add), byDay: { [day]: FieldValue.increment(add) }, lastAt: now, peak: Math.max(Number(s.get('peak') ?? 0), listeners) }, { merge: true })
    return { minutes: Number(s.get('minutes') ?? 0) + add, alerts: (s.get('alerts') as number[] | undefined) ?? [] }
  })
  if (!total) return
  // The monthly hours are still counted (for the stats), but nobody is alerted unless the budget is switched on in Admin > Listening limits.
  if (!(await loadLimits(db)).budgetEnabled) return
  const pct = total.minutes / 60 / uc.limitHours * 100
  const crossed = [50, 75, 90].filter(t => pct >= t && !total.alerts.includes(t))
  if (crossed.length) {
    const t = Math.max(...crossed)
    await ref.set({ alerts: FieldValue.arrayUnion(...crossed) }, { merge: true })
    await notifyAdmins('ops', { title: `Listening hours at ${t}%`, body: `${Math.round(total.minutes / 60)} of ${uc.limitHours} hours used this month. Timeouts are tightening.` })
  }
}

export type Level = 'normal' | 'tight' | 'critical' | 'liveOnly'
export interface Budget { usedHours: number; limitHours: number; projectedHours: number; /** Probably-not-more-than month total (80th percentile). */ riskHours: number; /** True while guests may listen to everything (the month is comfortably under the limit). */ guestsOpen: boolean; forecastMode: string; pct: number; level: Level; month: string; byDay: Record<string, number>; peak: number }

let cached: { at: number; v: Budget } | null = null
export async function budgetState(db: Firestore, now = Date.now()): Promise<Budget> {
  if (cached && now - cached.at < 60_000) return cached.v
  const cfg = await loadConfig(db)
  const uc = await loadUsageConfig(db)
  const key = monthKey(now, cfg.timezone)
  const s = await db.collection('usage').doc(key).get()
  const used = Number(s.get('minutes') ?? 0) / 60
  const [y, m] = key.split('-').map(Number)
  const start = Date.UTC(y, m - 1, 1), end = Date.UTC(y, m, 1)
  const fc = await forecastUsage(db, used, now).catch(() => null)
  const frac = Math.max(0.1, Math.min(1, (now - start) / (end - start)))
  const projected = fc ? used + fc.remaining : used / frac
  const risk = fc ? used + fc.remainingP80 : projected * 1.5
  const pct = used / uc.limitHours * 100
  const level: Level = pct >= 95 ? 'liveOnly' : pct >= 85 ? 'critical' : pct >= 70 || projected >= uc.limitHours ? 'tight' : 'normal'
  const guestsOpen = level === 'normal' && risk < uc.limitHours * 0.8
  const byDay: Record<string, number> = {}
  for (const [k, v] of Object.entries((s.get('byDay') as Record<string, number> | undefined) ?? {})) byDay[k] = Math.round(v / 60 * 10) / 10
  const v: Budget = { usedHours: Math.round(used * 10) / 10, limitHours: uc.limitHours, projectedHours: Math.round(projected), riskHours: Math.round(risk), guestsOpen, forecastMode: fc?.mode ?? 'pace', pct: Math.round(pct * 10) / 10, level, month: key, byDay, peak: Number(s.get('peak') ?? 0) }
  cached = { at: now, v }
  return v
}
export const resetBudgetCache = () => { cached = null }

export interface Policy {
  idleMin: number
  sessionMaxMin: number
  /** Minutes per person per day, only while the month is on track to go over the limit. null = no cap. */
  dailyCapMin: number | null
  liveOnly: boolean
}
export function policyFor(b: Budget): Policy {
  const base = b.level === 'normal' ? { idleMin: 60, sessionMaxMin: 180 } : b.level === 'tight' ? { idleMin: 30, sessionMaxMin: 120 } : { idleMin: 15, sessionMaxMin: 60 }
  const over = b.projectedHours > b.limitHours
  const dailyCapMin = over ? Math.max(30, Math.min(180, Math.round(180 * b.limitHours / b.projectedHours))) : null
  return { ...base, dailyCapMin, liveOnly: b.level === 'liveOnly' }
}

/** Overnight quiet hours: true while the station is in them (local time). */
export function inQuietHours(uc: UsageConfig, tz: string, now = Date.now()): boolean {
  if (!uc.quietEnabled || uc.quietStart === uc.quietEnd) return false
  const h = localParts(now, tz).minutes / 60
  return uc.quietStart < uc.quietEnd ? h >= uc.quietStart && h < uc.quietEnd : h >= uc.quietStart || h < uc.quietEnd
}
