import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { loadConfig } from './autoschedule'
import { buildScheduleFeed } from './scheduleFeed'
import { localDate, localToUtc } from './tz'
import { localParts } from '../autoschedule'
import { DAY, HOUR, forecastRemaining, normLabel, type Forecast, type Rec, type Slot } from '../forecast'

// Gathers the past hourly listening and the rest of the month's schedule, and asks the model (forecast.ts) what is still to come.

// The history is thousands of small records, so the result is kept (in memory and in `usage/forecast`) for 3 hours.
const TTL = 3 * 3_600_000
let cache: { at: number; value: Forecast } | null = null

export async function forecastUsage(db: Firestore, usedHours: number, now = Date.now()): Promise<Forecast> {
  if (cache && now - cache.at < TTL) return cache.value
  const stored = await db.collection('usage').doc('forecast').get()
  if (stored.exists && now - Number(stored.get('at')) < TTL) { cache = { at: Number(stored.get('at')), value: stored.get('value') as Forecast }; return cache.value }
  const cfg = await loadConfig(db)
  const tz = cfg.timezone
  const [y, m] = localDate(now, tz)
  const monthStart = localToUtc(y, m, 1, 0, tz)
  const monthEnd = localToUtc(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, tz)

  // History: the last 8 weeks, with the data's own labels.
  const snap = await db.collection('usageHours').where('hourStart', '>', now - 56 * DAY).get()
  const recs: Rec[] = snap.docs.map(d => ({
    hourStart: d.get('hourStart'), dow: d.get('dow'), hour: d.get('hour'), label: String(d.get('label') ?? ''),
    listenerMin: Number(d.get('listenerMin') ?? 0), observedMin: Number(d.get('observedMin') ?? 0),
  }))

  // Future: every remaining hour of the month and what the schedule has on in it (shows beat the auto DJ's genre blocks).
  const days = Math.min(32, Math.ceil((monthEnd - now) / DAY) + 1)
  const feed = await buildScheduleFeed(db, { days, showStudentHosts: false, now })
  const future: Slot[] = []
  const firstHour = Math.ceil(now / HOUR) * HOUR
  for (let t = firstHour; t < monthEnd; t += HOUR) {
    const mid = t + HOUR / 2
    const items = feed.filter(i => i.startAt <= mid && i.endAt > mid)
    const pick = items.find(i => i.source !== 'auto') ?? items[0]
    const lp = localParts(t, tz)
    future.push({ hourStart: t, dow: lp.dow, hour: Math.floor(lp.minutes / 60), label: pick ? normLabel(pick.title) : '' })
  }
  const elapsedDays = Math.max(0, (now - monthStart) / DAY)
  const remainingDays = Math.max(0, (monthEnd - now) / DAY)
  const value = forecastRemaining(recs, future, now, usedHours, elapsedDays, remainingDays)
  cache = { at: now, value }
  await db.collection('usage').doc('forecast').set({ at: now, value }).catch(() => {})
  return value
}
