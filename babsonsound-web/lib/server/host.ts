import 'server-only'
import { Timestamp, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { endAfter, localParts, occursOn, parseClock, type Repeat } from '../autoschedule'
import { loadConfig } from './autoschedule'
import { localDate, localToUtc } from './tz'
import { HttpError, requireUser } from './http'
import { accessOf } from './access'

// Show hosts: who is on air is worked out from the schedule, not from a role someone has to switch on and off.
// A host's panel (radio controls and set list) is open from 4 hours before their show to 4 hours after it.

export const HOST_WINDOW_MS = 4 * 3_600_000

export interface HostShow {
  key: string            // weekly:<id> or slot:<id>
  kind: 'weekly' | 'slot'
  refId: string          // schedule doc id or airSlots doc id
  title: string
  startAt: number
  endAt: number
}

/** Host mode: today (station time) is a day one of your shows is on. A show that runs past midnight counts the next day too. */
export function hostDayActive(shows: HostShow[], now: number, tz: string): boolean {
  const day = (ms: number) => { const [y, m, d] = localDate(ms, tz); return y * 10_000 + m * 100 + d }
  const today = day(now)
  return shows.some(s => day(s.startAt) <= today && today <= day(Math.max(s.startAt, s.endAt - 1)))
}

export const showOpen = (s: HostShow, now: number) => now >= s.startAt - HOST_WINDOW_MS && now <= s.endAt + HOST_WINDOW_MS
export const occurrenceId = (s: Pick<HostShow, 'key' | 'startAt'>) => `${s.key.replace(':', '-')}_${s.startAt}`

// The Host tab check (Nav asks every minute, for everyone) can use a 90 s old copy of the person's slots and weekly shows;
// the host controls themselves always read fresh (brief = false).
const hostDocCache = new Map<string, { at: number; v: Promise<{ slots: QueryDocumentSnapshot[]; weekly: QueryDocumentSnapshot[] }> }>()
function hostDocs(db: Firestore, uid: string, brief: boolean) {
  const load = async () => {
    const [slots, weekly] = await Promise.all([
      db.collection('airSlots').where('requesterUid', '==', uid).get(),
      db.collection('schedule').where('hostUids', 'array-contains', uid).get(),
    ])
    return { slots: slots.docs, weekly: weekly.docs }
  }
  if (!brief) return load()
  const hit = hostDocCache.get(uid)
  if (hit && Date.now() - hit.at < 90_000) return hit.v
  const v = load()
  const entry = { at: Date.now(), v }
  if (hostDocCache.size > 2000) hostDocCache.clear()
  hostDocCache.set(uid, entry)
  v.catch(() => { if (hostDocCache.get(uid) === entry) hostDocCache.delete(uid) })
  return v
}

/** This person's shows from yesterday through the next `days` days (weekly shows they host, and their approved student slots). */
export async function hostShows(db: Firestore, uid: string, now: number, days = 7, brief = false): Promise<HostShow[]> {
  const out: HostShow[] = []
  const tz = (await loadConfig(db)).timezone

  const { slots, weekly } = await hostDocs(db, uid, brief)
  for (const d of slots) {
    const startAt = (d.get('startAt') as Timestamp).toMillis(), endAt = (d.get('endAt') as Timestamp).toMillis()
    if (endAt < now - 86_400_000 || startAt > now + days * 86_400_000) continue
    out.push({ key: `slot:${d.id}`, kind: 'slot', refId: d.id, title: d.get('title') ?? 'Your show', startAt, endAt })
  }

  for (let off = -1; off <= days; off++) {
    const probe = now + off * 86_400_000
    const [y, m, dd] = localDate(probe, tz)
    const dow = localParts(probe, tz).dow
    for (const w of weekly) {
      if (w.get('isActive') === false) continue
      if (!occursOn({ dayOfWeek: w.get('dayOfWeek'), repeat: w.get('repeat'), anchor: w.get('anchor'), weeks: w.get('weeks'), dates: w.get('dates') } as Repeat & { dayOfWeek?: number }, dow, y, m, dd)) continue
      const s = parseClock(String(w.get('startTime') ?? ''))
      if (s === null) continue
      const e = parseClock(String(w.get('endTime') ?? ''))
      const endMin = e !== null ? endAfter(s, e) : s + 60
      out.push({
        key: `weekly:${w.id}`, kind: 'weekly', refId: w.id, title: w.get('showName') ?? 'Your show',
        startAt: localToUtc(y, m, dd, s, tz), endAt: localToUtc(y, m, dd, endMin, tz),
      })
    }
  }
  return out.sort((a, b) => a.startAt - b.startAt)
}

/** Admins can always use the controls. */
export async function isStaffUser(_db: Firestore, t: DecodedIdToken): Promise<boolean> {
  return (await accessOf(t)).level === 'admin'
}

/** Directors and admins can change live info on any show. Hosts only on their own. */
export async function canEditAnyShow(_db: Firestore, t: DecodedIdToken): Promise<boolean> {
  const l = (await accessOf(t)).level
  return l === 'admin' || l === 'director'
}

export interface HostContext { t: DecodedIdToken; staff: boolean; shows: HostShow[]; open: HostShow[] }

/** Signed-in student or above (guests get 403). "Host" is not a role: it is whoever has a booked or approved show. With the list of their shows and which are inside the 4-hour window. */
export async function hostContext(req: Request, db: Firestore, now = Date.now(), brief = false): Promise<HostContext> {
  return hostContextFor(await requireUser(req), db, now, brief)
}

/** Same, for a caller that has already checked the sign-in (the live bundle). */
export async function hostContextFor(t: DecodedIdToken, db: Firestore, now = Date.now(), brief = false): Promise<HostContext> {
  if ((await accessOf(t)).level === 'guest') throw new HttpError(403, 'This is for Babson, Olin and Wellesley students.', 'BR-PERM-001')
  const [staff, shows] = await Promise.all([isStaffUser(db, t), hostShows(db, t.uid, now, 7, brief)])
  return { t, staff, shows, open: shows.filter(s => showOpen(s, now)) }
}

/** For radio controls: only inside the window of one of your shows (staff are always allowed). */
export async function requireOnAir(req: Request, db: Firestore): Promise<HostContext> {
  const c = await hostContext(req, db)
  if (!c.staff && c.open.length === 0) {
    throw new HttpError(403,
      c.shows.length ? "Your controls open 4 hours before your show starts." : "You aren't listed as a host on any show.",
      c.shows.length ? 'BR-HST-001' : 'BR-HST-002')
  }
  return c
}
