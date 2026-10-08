import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { clipInterval, localParts, occursOn, parseClock, type Repeat } from '../autoschedule'
import { loadConfig } from './autoschedule'
import { localDate, localToUtc } from './tz'

// One schedule for everyone (website, iOS app): weekly shows + approved student slots + genre blocks.

export interface ScheduleItem {
  id: string
  source: 'weekly' | 'slot' | 'auto' | 'event'
  title: string
  description: string
  hosts: string[]
  imageUrl: string
  category: string
  format: 'show' | 'live' | 'prerecorded' | 'playlist'
  startAt: number
  endAt: number
  showSlug: string
  /** Color the scheduler picked (#RRGGBB), or '' for the default. */
  color: string
  /** What a bell is attached to: weekly:<show>, slot:<id> or genre:<name> (every block of that genre). */
  reminderKey: string
}

export async function buildScheduleFeed(db: Firestore, opts: { days: number; showStudentHosts: boolean; now?: number; includeAuto?: boolean; back?: number }): Promise<ScheduleItem[]> {
  const now = opts.now ?? Date.now()
  const until = now + opts.days * 86_400_000
  const back = Math.max(0, Math.min(14, Math.floor(opts.back ?? 0)))   // days of past schedule to include
  const since = now - back * 86_400_000
  const cfg = await loadConfig(db)
  const tz = cfg.timezone
  const items: ScheduleItem[] = []

  const slots = await db.collection('airSlots').where('endAt', '>', Timestamp.fromMillis(since)).get()
  for (const d of slots.docs) {
    const startAt = d.get('startAt').toMillis() as number
    if (startAt >= until) continue
    items.push({
      id: `slot-${d.id}`, source: 'slot', title: d.get('title'), description: d.get('description') ?? '',
      hosts: opts.showStudentHosts && d.get('hostName') ? [d.get('hostName')] : [],
      imageUrl: d.get('imageUrl') ?? '', category: d.get('category') ?? '',
      format: d.get('type') === 'prerecorded' ? 'prerecorded' : 'live',
      startAt, endAt: d.get('endAt').toMillis(), showSlug: '', color: '', reminderKey: `slot:${d.id}`,
    })
  }

  const autoPieces: ScheduleItem[] = []
  const autos = opts.includeAuto === false ? { docs: [] } : await db.collection('autoBlocks').where('endAt', '>', Timestamp.fromMillis(since)).get()
  for (const d of autos.docs) {
    const startAt = d.get('startAt').toMillis() as number
    if (startAt >= until) continue
    autoPieces.push({
      id: `auto-${d.id}`, source: 'auto', title: d.get('label'), description: '', hosts: [], imageUrl: '', category: '',
      format: 'playlist', startAt, endAt: d.get('endAt').toMillis(), showSlug: '', color: '',
      reminderKey: `genre:${String(d.get('label') ?? '').toLowerCase()}`,
    })
  }

  // One-time events the station scheduled by hand.
  const evs = await db.collection('events').where('endAt', '>', Timestamp.fromMillis(since)).get()
  for (const d of evs.docs) {
    const startAt = d.get('startAt').toMillis() as number
    if (startAt >= until || d.get('isActive') === false) continue
    items.push({
      id: `event-${d.id}`, source: 'event', title: d.get('title') ?? '', description: d.get('description') ?? '',
      hosts: Array.isArray(d.get('hostNames')) ? d.get('hostNames') : [], imageUrl: d.get('imageUrl') ?? '',
      category: d.get('category') ?? '', format: 'show', startAt, endAt: d.get('endAt').toMillis(), showSlug: '',
      color: d.get('color') ?? '', reminderKey: `event:${d.id}`,
    })
  }

  const weekly = await db.collection('schedule').where('isActive', '==', true).get()
  for (let off = -back; off <= opts.days; off++) {
    const probe = now + off * 86_400_000
    const [y, m, dd] = localDate(probe, tz)
    const dow = localParts(probe, tz).dow
    for (const w of weekly.docs) {
      if (!occursOn({ dayOfWeek: w.get('dayOfWeek'), repeat: w.get('repeat'), anchor: w.get('anchor'), weeks: w.get('weeks'), dates: w.get('dates') } as Repeat & { dayOfWeek?: number }, dow, y, m, dd)) continue
      const s = parseClock(String(w.get('startTime') ?? ''))
      if (s === null) continue
      const e = parseClock(String(w.get('endTime') ?? ''))
      const dur = Number(w.get('durationMin'))
      const endMin = e !== null && e > s ? e : s + (Number.isFinite(dur) && dur > 0 ? dur : 60)
      const startAt = localToUtc(y, m, dd, s, tz), endAt = localToUtc(y, m, dd, endMin, tz)
      if (endAt <= since || startAt >= until) continue
      items.push({
        id: `weekly-${w.id}-${y}${m}${dd}`,
        // Shows that don't air every week are marked as one-offs so the iPhone app doesn't set a repeating weekly alert for them.
        source: (w.get('repeat') ?? 'weekly') === 'weekly' ? 'weekly' : 'event', title: w.get('showName') ?? '', description: w.get('description') ?? '',
        hosts: Array.isArray(w.get('hostNames')) ? w.get('hostNames') : [], imageUrl: w.get('imageUrl') ?? '',
        category: w.get('category') ?? '', format: 'show', startAt, endAt, showSlug: w.get('showSlug') ?? '',
        color: w.get('color') ?? '',
        reminderKey: `weekly:${w.id}`,
      })
    }
  }

  // Anything scheduled on top of an auto block takes its place: the auto block is shortened, split or dropped.
  const real = items.map(i => ({ startMs: i.startAt, endMs: i.endAt }))
  for (const a of autoPieces) {
    clipInterval({ startMs: a.startAt, endMs: a.endAt }, real).forEach((c, n) =>
      items.push({ ...a, id: n === 0 ? a.id : `${a.id}-${n}`, startAt: c.startMs, endAt: c.endMs }))
  }
  return items.sort((a, b) => a.startAt - b.startAt)
}
