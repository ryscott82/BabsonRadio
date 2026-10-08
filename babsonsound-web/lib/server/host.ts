import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { endAfter, localParts, occursOn, parseClock, type Repeat } from '../autoschedule'
import { loadConfig } from './autoschedule'
import { localDate, localToUtc } from './tz'
import { HttpError, isBabsonToken, isDeveloperToken, requireUser } from './http'

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

export const showOpen = (s: HostShow, now: number) => now >= s.startAt - HOST_WINDOW_MS && now <= s.endAt + HOST_WINDOW_MS
export const occurrenceId = (s: Pick<HostShow, 'key' | 'startAt'>) => `${s.key.replace(':', '-')}_${s.startAt}`

/** This person's shows from yesterday through the next `days` days (weekly shows they host, and their approved student slots). */
export async function hostShows(db: Firestore, uid: string, now: number, days = 7): Promise<HostShow[]> {
  const out: HostShow[] = []
  const tz = (await loadConfig(db)).timezone

  const slots = await db.collection('airSlots').where('requesterUid', '==', uid).get()
  for (const d of slots.docs) {
    const startAt = (d.get('startAt') as Timestamp).toMillis(), endAt = (d.get('endAt') as Timestamp).toMillis()
    if (endAt < now - 86_400_000 || startAt > now + days * 86_400_000) continue
    out.push({ key: `slot:${d.id}`, kind: 'slot', refId: d.id, title: d.get('title') ?? 'Your show', startAt, endAt })
  }

  const weekly = await db.collection('schedule').where('hostUids', 'array-contains', uid).get()
  for (let off = -1; off <= days; off++) {
    const probe = now + off * 86_400_000
    const [y, m, dd] = localDate(probe, tz)
    const dow = localParts(probe, tz).dow
    for (const w of weekly.docs) {
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

/** Developers and admins can always use the controls. */
export async function isStaffUser(db: Firestore, t: DecodedIdToken): Promise<boolean> {
  if (isDeveloperToken(t)) return true
  if (!isBabsonToken(t)) return false
  return (await db.collection('users').doc(t.uid).get()).get('role') === 'superAdmin'
}

/** Directors, admins and developers can change live info on any show. Hosts only on their own. */
export async function canEditAnyShow(db: Firestore, t: DecodedIdToken): Promise<boolean> {
  if (isDeveloperToken(t)) return true
  if (!isBabsonToken(t)) return false
  const role = (await db.collection('users').doc(t.uid).get()).get('role')
  return role === 'superAdmin' || role === 'director'
}

export interface HostContext { t: DecodedIdToken; staff: boolean; shows: HostShow[]; open: HostShow[] }

/** Signed-in student (or developer) with the list of their shows and which are inside the 4-hour window. */
export async function hostContext(req: Request, db: Firestore, now = Date.now()): Promise<HostContext> {
  const t = await requireUser(req)
  if (!isBabsonToken(t) && !isDeveloperToken(t)) throw new HttpError(403, 'Verify your school email to do this.')
  const [staff, shows] = await Promise.all([isStaffUser(db, t), hostShows(db, t.uid, now)])
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
