import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { localParts, parseClock } from '../autoschedule'
import { loadConfig } from './autoschedule'
import { localDate, localToUtc } from './tz'

// One schedule for everyone (website, iOS app): weekly shows + approved student slots + genre blocks.

export interface ScheduleItem {
  id: string
  source: 'weekly' | 'slot' | 'auto'
  title: string
  description: string
  hosts: string[]
  imageUrl: string
  category: string
  format: 'show' | 'live' | 'prerecorded' | 'playlist'
  startAt: number
  endAt: number
  showSlug: string
  /** What a bell is attached to: weekly:<show>, slot:<id> or genre:<name> (every block of that genre). */
  reminderKey: string
}

export async function buildScheduleFeed(db: Firestore, opts: { days: number; showStudentHosts: boolean; now?: number }): Promise<ScheduleItem[]> {
  const now = opts.now ?? Date.now()
  const until = now + opts.days * 86_400_000
  const cfg = await loadConfig(db)
  const tz = cfg.timezone
  const items: ScheduleItem[] = []

  const slots = await db.collection('airSlots').where('endAt', '>', Timestamp.fromMillis(now)).get()
  for (const d of slots.docs) {
    const startAt = d.get('startAt').toMillis() as number
    if (startAt >= until) continue
    items.push({
      id: `slot-${d.id}`, source: 'slot', title: d.get('title'), description: d.get('description') ?? '',
      hosts: opts.showStudentHosts && d.get('hostName') ? [d.get('hostName')] : [],
      imageUrl: d.get('imageUrl') ?? '', category: d.get('category') ?? '',
      format: d.get('type') === 'prerecorded' ? 'prerecorded' : 'live',
      startAt, endAt: d.get('endAt').toMillis(), showSlug: '', reminderKey: `slot:${d.id}`,
    })
  }

  const autos = await db.collection('autoBlocks').where('endAt', '>', Timestamp.fromMillis(now)).get()
  for (const d of autos.docs) {
    const startAt = d.get('startAt').toMillis() as number
    if (startAt >= until) continue
    items.push({
      id: `auto-${d.id}`, source: 'auto', title: d.get('label'), description: '', hosts: [], imageUrl: '', category: '',
      format: 'playlist', startAt, endAt: d.get('endAt').toMillis(), showSlug: '',
      reminderKey: `genre:${String(d.get('label') ?? '').toLowerCase()}`,
    })
  }

  const weekly = await db.collection('schedule').where('isActive', '==', true).get()
  for (let off = 0; off <= opts.days; off++) {
    const probe = now + off * 86_400_000
    const [y, m, dd] = localDate(probe, tz)
    const dow = localParts(probe, tz).dow
    for (const w of weekly.docs) {
      if (w.get('dayOfWeek') !== dow) continue
      const s = parseClock(String(w.get('startTime') ?? ''))
      if (s === null) continue
      const e = parseClock(String(w.get('endTime') ?? ''))
      const dur = Number(w.get('durationMin'))
      const endMin = e !== null && e > s ? e : s + (Number.isFinite(dur) && dur > 0 ? dur : 60)
      const startAt = localToUtc(y, m, dd, s, tz), endAt = localToUtc(y, m, dd, endMin, tz)
      if (endAt <= now || startAt >= until) continue
      items.push({
        id: `weekly-${w.id}-${y}${m}${dd}`, source: 'weekly', title: w.get('showName') ?? '', description: w.get('description') ?? '',
        hosts: Array.isArray(w.get('hostNames')) ? w.get('hostNames') : [], imageUrl: w.get('imageUrl') ?? '',
        category: w.get('category') ?? '', format: 'show', startAt, endAt, showSlug: w.get('showSlug') ?? '',
        reminderKey: `weekly:${w.id}`,
      })
    }
  }
  return items.sort((a, b) => a.startAt - b.startAt)
}
