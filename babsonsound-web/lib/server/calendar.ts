import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { buildScheduleFeed } from './scheduleFeed'

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

/** 'live' = shows, student slots and events (the main calendar). 'auto' = only the auto DJ playlist blocks, kept in their own calendar so they don't fill people's calendars. */
export async function buildCalendar(db: Firestore, now = Date.now(), kind: 'live' | 'auto' = 'live'): Promise<string> {
  // Same schedule the website and the app show (shows, student slots, one-time events, genre blocks, and what
  // AzuraCast really played when it differed from the plan), plus yesterday so corrections show up in past events.
  const feed = await buildScheduleFeed(db, { days: 28, back: 1, showStudentHosts: false, now })
  const events: Ev[] = feed.filter(i => (i.source === 'auto') === (kind === 'auto')).map(i => ({
    uid: `${i.id}@babsonradio.com`, start: i.startAt, end: i.endAt, title: i.title,
    desc: i.source === 'auto' ? 'Babson Radio playlist' : i.hosts.length ? `with ${i.hosts.join(', ')}` : i.description,
  }))

  events.sort((a, b) => a.start - b.start)
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Babson Radio//Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    kind === 'auto' ? 'X-WR-CALNAME:Babson Radio Music' : 'X-WR-CALNAME:Babson Radio',
    kind === 'auto' ? 'X-WR-CALDESC:Playlists on Babson Radio when no one is live' : 'X-WR-CALDESC:Live shows on Babson Radio',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M',
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
