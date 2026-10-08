import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { endAfter, localParts, occursOn, parseClock, type Repeat } from '../autoschedule'
import { loadConfig } from './autoschedule'
import { localToUtc } from './tz'
import { SLOT_TYPES, type SlotType } from '../slots'

// Builds the subscribable calendar (.ics): weekly shows, approved student slots and the auto-scheduled genre blocks.

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** RFC 5545: lines are at most 75 octets; continuation lines start with a space. */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ch } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

interface Ev { uid: string; start: number; end: number; title: string; desc?: string }

export async function buildCalendar(db: Firestore, now = Date.now()): Promise<string> {
  const cfg = await loadConfig(db)
  const tz = cfg.timezone
  const events: Ev[] = []

  // Approved student slots (public details only: no names)
  const slots = await db.collection('airSlots').where('endAt', '>', Timestamp.fromMillis(now)).get()
  for (const d of slots.docs) {
    events.push({
      uid: `slot-${d.id}@babsonradio.com`,
      start: d.get('startAt').toMillis(), end: d.get('endAt').toMillis(),
      title: d.get('title'), desc: SLOT_TYPES[d.get('type') as SlotType] ?? '',
    })
  }

  // Genre blocks from the auto-scheduler
  const autos = await db.collection('autoBlocks').where('endAt', '>', Timestamp.fromMillis(now)).get()
  for (const d of autos.docs) {
    events.push({
      uid: `auto-${d.id}@babsonradio.com`,
      start: d.get('startAt').toMillis(), end: d.get('endAt').toMillis(),
      title: d.get('label'), desc: 'Babson Radio playlist',
    })
  }

  // Weekly shows expanded 28 days ahead in station time
  const weekly = await db.collection('schedule').where('isActive', '==', true).get()
  for (let off = 0; off < 28; off++) {
    const probe = now + off * 86_400_000
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(probe)).split('-').map(Number)
    const dow = localParts(probe, tz).dow
    for (const w of weekly.docs) {
      if (!occursOn({ dayOfWeek: w.get('dayOfWeek'), repeat: w.get('repeat'), anchor: w.get('anchor'), weeks: w.get('weeks'), dates: w.get('dates') } as Repeat & { dayOfWeek?: number }, dow, day[0], day[1], day[2])) continue
      const s = parseClock(String(w.get('startTime') ?? ''))
      if (s === null) continue
      const e = parseClock(String(w.get('endTime') ?? ''))
      const dur = Number(w.get('durationMin'))
      const endMin = e !== null ? endAfter(s, e) : s + (Number.isFinite(dur) && dur > 0 ? dur : 60)
      const start = localToUtc(day[0], day[1], day[2], s, tz)
      const end = localToUtc(day[0], day[1], day[2], endMin, tz)
      if (end <= now) continue
      const hosts = (w.get('hostNames') as string[] | undefined)?.join(', ')
      events.push({
        uid: `weekly-${w.id}-${day.join('')}@babsonradio.com`, start, end,
        title: w.get('showName'), desc: hosts ? `with ${hosts}` : '',
      })
    }
  }

  events.sort((a, b) => a.start - b.start)
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Babson Radio//Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Babson Radio', 'X-WR-CALDESC:What is on Babson Radio',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ...events.flatMap(e => [
      'BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`,
      `SUMMARY:${esc(String(e.title ?? 'Babson Radio'))}`,
      ...(e.desc ? [`DESCRIPTION:${esc(e.desc)}`] : []),
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
