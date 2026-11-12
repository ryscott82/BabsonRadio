// The Members page, with no React: who sees which section, the "Next up for me" lines, standing wording and the training rows.

export type SectionId = 'next' | 'host' | 'studio' | 'standing' | 'training' | 'events' | 'info'
export type Viewer = 'signed-out' | 'guest' | 'student'

export const viewerOf = (o: { signedIn: boolean; isGuest: boolean; isBabson: boolean }): Viewer => (!o.signedIn ? 'signed-out' : o.isBabson ? 'student' : 'guest')

/** Top to bottom. Everyone can read events and info; the rest are for signed-in students (hidden, not greyed, for everyone else). */
const ALL: SectionId[] = ['next', 'host', 'studio', 'standing', 'training', 'events', 'info']
export function sectionsFor(v: Viewer): SectionId[] {
  return v === 'student' ? ALL : ['events', 'info']
}

/** The line shown in place of the hidden sections. */
export const signInPrompt = (v: Viewer) =>
  v === 'student' ? '' : v === 'guest' ? 'Booking and hosting are for Babson, Olin and Wellesley students. Sign in with your school email.' : 'Sign in with your school email to host a show, book the studio and see your training.'

export const fmtWhen = (ms: number, tz = 'America/New_York') =>
  new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz })
export const fmtDate = (ms: number, tz = 'America/New_York') => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz })

// ── Next up for me ──
export interface NextBooking { startAt: number; endAt: number; status?: string }
export interface NextShow { title: string; startAt: number; status: string }
export interface BadgeRow { name: 'Studio' | 'Radio'; has: boolean; expiresAt: number | null; expired: boolean }

export interface NextItem { kind: 'booking' | 'show' | 'training'; text: string; href: string; when: number }

const DAY = 86_400_000
export const EXPIRY_WARN_DAYS = 30

/** My next studio booking, my next show and a training that is due or running out, in that order (soonest first within what is shown). */
export function nextUp(o: { now: number; bookings: NextBooking[]; shows: NextShow[]; badges: BadgeRow[] }): NextItem[] {
  const out: NextItem[] = []
  const b = o.bookings.filter(x => x.endAt > o.now && (!x.status || x.status === 'booked' || x.status === 'checked-in')).sort((a, c) => a.startAt - c.startAt)[0]
  if (b) out.push({ kind: 'booking', text: `Studio ${fmtWhen(b.startAt)}`, href: '#studio', when: b.startAt })
  const s = o.shows.filter(x => x.startAt > o.now && (x.status === 'approved' || x.status === 'pending')).sort((a, c) => a.startAt - c.startAt)[0]
  if (s) out.push({ kind: 'show', text: `${s.title}, ${fmtWhen(s.startAt)}${s.status === 'pending' ? ' (pending)' : ''}`, href: '/slots#mine', when: s.startAt })
  const t = trainingDue(o.badges, o.now)
  if (t) out.push({ kind: 'training', text: t, href: '#training', when: o.now })
  return out
}

/** A training that has run out or runs out within 30 days, or '' (a person who was never trained gets the Get trained button instead). */
export function trainingDue(badges: BadgeRow[], now: number): string {
  for (const b of badges) {
    if (b.expired) return `${b.name} training has ended. Renew it.`
    if (b.has && b.expiresAt && b.expiresAt - now <= EXPIRY_WARN_DAYS * DAY) return `${b.name} training ends ${fmtDate(b.expiresAt)}.`
  }
  return ''
}

// ── Standing ──
export interface Standing { level: number; label: string; bannedUntil: number | null; strikes: { date: string; reason: string }[] }
export type StandingTone = 'good' | 'note' | 'warn' | 'ban'

export function standingView(s: Standing | null | undefined): { tone: StandingTone; headline: string; detail: string; lines: string[]; banned: boolean } {
  const lines = (s?.strikes ?? []).map(x => `${x.date}: ${x.reason}`)
  if (!s || s.level <= 0) return { tone: 'good', headline: 'Good standing', detail: 'Nothing to fix. Keep showing up and you stay here.', lines, banned: false }
  if (s.level === 1) return { tone: 'note', headline: '1 mistake', detail: 'One missed show or booking so far. A second one is a warning.', lines, banned: false }
  if (s.level === 2) return { tone: 'warn', headline: 'Warning', detail: 'Two mistakes. A third one means no hosting or booking for the rest of the semester.', lines, banned: false }
  return { tone: 'ban', headline: s.bannedUntil ? `Banned until ${fmtDate(s.bannedUntil)}` : s.label, detail: 'You cannot request shows or book the studio until then. You can still listen to everything. Talk to the E-board if this looks wrong.', lines, banned: true }
}

/** The sentence a banned person sees instead of the forms: why and until when. */
export function bannedNotice(s: Standing | null | undefined): string {
  if (!s || s.level < 3) return ''
  const why = s.strikes.length ? ` It comes from: ${s.strikes.map(x => `${x.reason.toLowerCase()} (${x.date})`).join('; ')}.` : ''
  return `You cannot host or book until ${s.bannedUntil ? fmtDate(s.bannedUntil) : 'the end of the semester'}.${why}`
}

// ── Training ──
export function badgeRows(t: { studioExpiresAt?: number | null; radioExpiresAt?: number | null; studioExpired?: boolean; radioExpired?: boolean } | null | undefined, o: { studio: boolean; radio: boolean }): BadgeRow[] {
  return [
    { name: 'Studio', has: o.studio, expiresAt: t?.studioExpiresAt ?? null, expired: t?.studioExpired === true },
    { name: 'Radio', has: o.radio, expiresAt: t?.radioExpiresAt ?? null, expired: t?.radioExpired === true },
  ]
}

export function badgeLine(b: BadgeRow): string {
  if (b.expired) return `${b.name} badge: ended${b.expiresAt ? ` ${fmtDate(b.expiresAt)}` : ''}`
  if (!b.has) return `${b.name} badge: not yet`
  return `${b.name} badge: ${b.expiresAt ? `until ${fmtDate(b.expiresAt)}` : 'active'}`
}

/** Studio booking needs the Studio badge. Without it the page shows "Get trained" instead of an error. */
export const canBook = (studioTrained: boolean) => studioTrained
export const needsTraining = (badges: BadgeRow[]) => badges.some(b => !b.has || b.expired)

// ── Info ──
export const INFO = {
  rules: [
    'Be kind on air and in the room. The respect agreement applies to every show.',
    'Clean the studio when you leave: desk clear, mics off, chairs pushed in.',
    'Walk-ins are welcome whenever the studio is free. A booking just reserves it.',
    'Missed shows and bookings count: a mistake, then a warning, then a ban for the semester. The E-board can excuse a mistake.',
  ],
  cleanHours: 'Clean hours are 6 AM to 10 PM Eastern: no explicit music or language on air.',
  quietHours: 'Quiet hours: Monday to Friday 9 AM to 4 PM and 10 PM to 7 AM. No loud DJ sets, keep the volume as low as possible. Nothing is blocked.',
  contactNote: 'Questions? Write to the E-board. Anyone can reach us from the Support page.',
}

// ── Recordings ──
const REC_WORD: Record<string, string> = { recording: 'Recording now', uploading: 'Uploading', uploaded: 'Ready', attached: 'Attached to a show', aired: 'Aired' }
export const recordingWord = (status: string) => REC_WORD[status] ?? status
/** Only a finished recording that is not on a show yet can be scheduled. */
export const canSchedule = (status: string) => status === 'uploaded'
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
