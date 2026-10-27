import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { clipInterval, endAfter, localParts, occursOn, parseClock, type Repeat } from '../autoschedule'
import { loadConfig } from './autoschedule'
import { isInterstitial } from './actualPlaylist'
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
  /** Student hosts, for per-host show options. Never sent to the public schedule. */
  hostUids?: string[]
  /** One-time events only: true when the scheduler chose "Use auto DJ metadata" (otherwise the event name is shown, not the auto DJ's songs). */
  useAutoMeta?: boolean
}

type FeedOpts = { days: number; showStudentHosts: boolean; now?: number; includeAuto?: boolean; back?: number }

// Building the feed reads about six collections, and it runs on almost every request (now playing, listening
// check-ins, the schedule page). The schedule changes slowly, so each variant is reused for 45 seconds.
// That cuts the server's work (and Vercel's billed CPU time) a lot; an edit shows up within a minute.
const FEED_TTL = 45_000
const feedCache = new Map<string, { bucket: number; items: Promise<ScheduleItem[]> }>()

export function buildScheduleFeed(db: Firestore, opts: FeedOpts): Promise<ScheduleItem[]> {
  const now = opts.now ?? Date.now()
  const key = `${opts.days}|${opts.showStudentHosts}|${opts.includeAuto}|${opts.back ?? 0}`
  const bucket = Math.floor(now / FEED_TTL)
  const hit = feedCache.get(key)
  if (hit && hit.bucket === bucket) return hit.items.then(a => a.map(i => ({ ...i })))
  const items = buildFeedUncached(db, opts)
  feedCache.set(key, { bucket, items })
  if (feedCache.size > 16) feedCache.clear()
  // A failed build must not stay cached.
  items.catch(() => { if (feedCache.get(key)?.items === items) feedCache.delete(key) })
  return items.then(a => a.map(i => ({ ...i })))
}

async function buildFeedUncached(db: Firestore, opts: FeedOpts): Promise<ScheduleItem[]> {
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
      hostUids: d.get('requesterUid') ? [d.get('requesterUid')] : [],
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

  // What really played when it differed from the plan (see actualPlaylist.ts): it replaces the planned block for that time.
  if (opts.includeAuto !== false) {
    const act = await db.collection('autoActual').where('endAt', '>', Timestamp.fromMillis(since)).get()
    const raw = act.docs.map(d => ({ id: d.id, startMs: d.get('startAt').toMillis() as number, endMs: d.get('endAt').toMillis() as number, label: String(d.get('label') ?? '') }))
      .filter(a => a.startMs < until && a.endMs > a.startMs && !isInterstitial(a.label))
      .sort((a, b) => a.startMs - b.startMs)
    // Tidy the records: same playlist back to back (gap under 20 min) becomes one block; when two overlap, the later one wins.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const actual: typeof raw = []
    for (const r of raw) {
      const prev = actual[actual.length - 1]
      if (prev && norm(prev.label) === norm(r.label) && r.startMs - prev.endMs <= 20 * 60_000) prev.endMs = Math.max(prev.endMs, r.endMs)
      else {
        if (prev && r.startMs < prev.endMs) prev.endMs = r.startMs
        actual.push({ ...r })
      }
    }
    for (let i = actual.length - 1; i >= 0; i--) if (actual[i].endMs <= actual[i].startMs) actual.splice(i, 1)
    if (actual.length) {
      const planned = autoPieces.splice(0)
      for (const a of planned) clipInterval({ startMs: a.startAt, endMs: a.endAt }, actual, 60_000).forEach((c, n) =>
        autoPieces.push({ ...a, id: n === 0 ? a.id : `${a.id}-${n}`, startAt: c.startMs, endAt: c.endMs }))
      for (const a of actual) autoPieces.push({
        id: `auto-actual-${a.id}`, source: 'auto', title: a.label, description: '', hosts: [], imageUrl: '', category: '',
        format: 'playlist', startAt: a.startMs, endAt: a.endMs, showSlug: '', color: '', reminderKey: `genre:${a.label.toLowerCase()}`,
      })
    }
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
      useAutoMeta: d.get('useAutoMeta') === true,
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
      const endMin = e !== null ? endAfter(s, e) : s + (Number.isFinite(dur) && dur > 0 ? dur : 60)
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
        hostUids: Array.isArray(w.get('hostUids')) ? w.get('hostUids') : [],
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
