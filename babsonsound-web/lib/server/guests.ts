import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { GUEST_DURATIONS, MAX_ACTIVE_GUESTS_PER_STUDENT, type GuestDuration } from '../guest'
import { HttpError, requireStudent } from './http'
import { accessOf } from './access'

export function isDuration(v: unknown): v is GuestDuration {
  return typeof v === 'string' && v in GUEST_DURATIONS
}

// Instant at 23:59:59 America/New_York on the given YYYY-MM-DD.
function endOfDayET(ymd: string): Date | null {
  for (const off of ['-04:00', '-05:00']) {
    const d = new Date(`${ymd}T23:59:59${off}`)
    if (isNaN(d.getTime())) return null
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(d)
    if (local === `${ymd}, 23:59`) return d
  }
  return null
}

/**
 * Next semester end. SEMESTER_END_DATES is a comma-separated list of MM-DD dates that repeat every
 * year (e.g. "12-18,05-14"). A full YYYY-MM-DD date is also accepted for a one-off. If unset, it
 * defaults to Dec 18 and May 14.
 */
export function nextSemesterEnd(now = new Date()): Date {
  const entries = (process.env.SEMESTER_END_DATES || '12-18,05-14')
    .split(',').map(s => s.trim()).filter(Boolean)
  const year = now.getUTCFullYear()
  const candidates: string[] = []
  for (const e of entries) {
    if (/^\d{2}-\d{2}$/.test(e)) for (const y of [year, year + 1]) candidates.push(`${y}-${e}`)
    else candidates.push(e)
  }
  const dates = candidates
    .map(endOfDayET).filter((d): d is Date => !!d && d > now)
    .sort((a, b) => a.getTime() - b.getTime())
  if (!dates.length) {
    throw new HttpError(400, 'End-of-semester access is not configured yet. Pick a fixed duration.')
  }
  return dates[0]
}

export function computeExpiry(duration: GuestDuration, now = new Date()): Date {
  const H = 3600_000
  switch (duration) {
    case '24h': return new Date(now.getTime() + 24 * H)
    case '7d': return new Date(now.getTime() + 7 * 24 * H)
    case '30d': return new Date(now.getTime() + 30 * 24 * H)
    case 'semester': return nextSemesterEnd(now)
  }
}

export async function assertSponsorCapacity(db: Firestore, sponsorUid: string, guestUid?: string) {
  const snap = await db.collection('guestPasses').where('sponsorUid', '==', sponsorUid).get()
  const now = Date.now()
  const active = snap.docs.filter(d =>
    d.id !== guestUid && d.get('revoked') !== true && d.get('expiresAt')?.toMillis() > now
  )
  if (active.length >= MAX_ACTIVE_GUESTS_PER_STUDENT) {
    throw new HttpError(409, `You can sponsor up to ${MAX_ACTIVE_GUESTS_PER_STUDENT} guests at a time. Revoke one first.`)
  }
}

export function passData(args: {
  guestEmail: string; sponsorUid: string; sponsorName: string; duration: GuestDuration
}) {
  const now = new Date()
  return {
    guestEmail: args.guestEmail,
    sponsorUid: args.sponsorUid,
    sponsorName: args.sponsorName,
    duration: args.duration,
    grantedAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(computeExpiry(args.duration, now)),
    revoked: false,
  }
}

export async function ensureGuestUserDoc(db: Firestore, uid: string, email: string, name: string) {
  const ref = db.collection('users').doc(uid)
  const snap = await ref.get()
  if (snap.exists) return
  await ref.set({
    firstName: name, displayName: name, email, role: 'guest', accountType: 'guest',
    notifyNewEpisode: [], notifyGoesLive: [], joinedAt: Timestamp.now(),
  })
}

/** The Library is for students and above. Guests (sponsored or not) get live radio only. */
export const requireLibrary = requireStudent

/** Same test as requireLibrary, as a yes/no. */
export async function canUseLibrary(t: import('firebase-admin/auth').DecodedIdToken): Promise<boolean> {
  return (await accessOf(t)).level !== 'guest'
}
