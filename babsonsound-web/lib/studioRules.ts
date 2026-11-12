import { createHmac, timingSafeEqual } from 'node:crypto'
import { roleLabel } from './roleLabel.ts'

// Studio training rules with no database and no 'server-only', so the tests can run them directly.

export type Badge = 'studio' | 'radio'
export const BADGES: Badge[] = ['studio', 'radio']
export type SessionStatus = 'scheduled' | 'checkin_open' | 'closed' | 'confirmed'

export const CODE_STEP_MS = 30_000
/** Check-in closes by itself this long after a session ends. */
export const AUTO_CLOSE_MS = 15 * 60_000
/** The trainer endpoint hands out this many upcoming codes at once, so the page never has to poll. */
export const CODES_AHEAD = 10

// ── badge expiry ──

const NY = 'America/New_York'
const yearInNy = (ms: number) => Number(new Intl.DateTimeFormat('en-US', { timeZone: NY, year: 'numeric' }).format(new Date(ms)))

/** June 30, 11:59 PM Eastern of a year. June is always daylight time (UTC-4). */
export const juneEnd = (year: number) => Date.UTC(year, 6, 1, 3, 59, 0)

/** The next June 30, 11:59 PM America/New_York after a grant date. */
export function badgeExpiry(grantedMs: number): number {
  const y = yearInNy(grantedMs)
  return juneEnd(y) > grantedMs ? juneEnd(y) : juneEnd(y + 1)
}

/** A badge with no expiry date (given by the old flow) never expires until it is migrated. */
export const badgeActive = (expiresMs: number | null | undefined, now: number) => expiresMs == null || now < expiresMs

// ── rotating check-in code ──

export const windowOf = (now: number) => Math.floor(now / CODE_STEP_MS)

/** First 6 decimal digits of the HMAC-SHA256 hex digest (hex letters are skipped, so every digit is equally likely). */
export function codeForWindow(secret: string, window: number): string {
  const hex = createHmac('sha256', secret).update(String(window)).digest('hex')
  return hex.replace(/[^0-9]/g, '').slice(0, 6)
}

/** The current code and the next ones, each with the time span it is shown for. */
export function upcomingCodes(secret: string, now: number, count = CODES_AHEAD) {
  const w = windowOf(now)
  return Array.from({ length: count }, (_, i) => ({ code: codeForWindow(secret, w + i), from: (w + i) * CODE_STEP_MS, until: (w + i + 1) * CODE_STEP_MS }))
}

/** Accepts the current and the previous 30-second window. */
export function codeMatches(secret: string, entered: string, now: number): boolean {
  if (!/^\d{6}$/.test(entered)) return false
  const w = windowOf(now)
  let ok = false
  for (const win of [w, w - 1]) {
    const a = Buffer.from(codeForWindow(secret, win)), b = Buffer.from(entered)
    if (a.length === b.length && timingSafeEqual(a, b)) ok = true
  }
  return ok
}

// ── session status ──

export interface SessionLike { status: SessionStatus; endsAt: number }

/** Check-in counts as closed 15 minutes after the session ends, even if nobody pressed Close. */
export function effectiveStatus(s: SessionLike, now: number): SessionStatus {
  if (s.status === 'checkin_open' && now > s.endsAt + AUTO_CLOSE_MS) return 'closed'
  return s.status
}

/** Check-in can be opened from scheduled (or reopened from closed) until 15 minutes after the session ends. */
export const canOpenCheckin = (s: SessionLike, now: number) => (s.status === 'scheduled' || s.status === 'closed') && now <= s.endsAt + AUTO_CLOSE_MS

// ── check-in tries: 5 a minute per person, 15-minute lock after 10 wrong codes ──

export const TRIES_PER_MIN = 5
export const FAILS_BEFORE_LOCK = 10
export const LOCK_MS = 15 * 60_000

export interface Guard { windowStart: number; tries: number; fails: number; lockUntil: number }
export const freshGuard = (): Guard => ({ windowStart: 0, tries: 0, fails: 0, lockUntil: 0 })

/** Count one attempt. Returns the new state and whether it may go ahead (else seconds until it may). */
export function guardStep(g: Guard, now: number): { guard: Guard; ok: true } | { guard: Guard; ok: false; why: 'locked' | 'rate'; retrySec: number } {
  if (now < g.lockUntil) return { guard: g, ok: false, why: 'locked', retrySec: Math.ceil((g.lockUntil - now) / 1000) }
  const inWindow = now - g.windowStart < 60_000
  const next: Guard = inWindow ? { ...g, tries: g.tries + 1 } : { ...g, windowStart: now, tries: 1 }
  if (next.tries > TRIES_PER_MIN) return { guard: g, ok: false, why: 'rate', retrySec: Math.ceil((g.windowStart + 60_000 - now) / 1000) }
  return { guard: next, ok: true }
}

/** A wrong code. The tenth wrong code locks check-in for 15 minutes. */
export function guardFail(g: Guard, now: number): Guard {
  const fails = g.fails + 1
  return fails >= FAILS_BEFORE_LOCK ? { ...g, fails: 0, lockUntil: now + LOCK_MS } : { ...g, fails }
}

/** A right code clears the wrong-code count. */
export const guardOk = (g: Guard): Guard => ({ ...g, fails: 0 })

// ── what a quiz pass grants ──

/** Radio needs a Studio badge already held, or one given in the same session. */
export function planGrants(covers: Badge[], hasStudio: boolean): { ok: true; badges: Badge[] } | { ok: false } {
  const badges = BADGES.filter(b => covers.includes(b))
  if (badges.includes('radio') && !badges.includes('studio') && !hasStudio) return { ok: false }
  return { ok: true, badges }
}

export interface Question { id: string; answer: number }
export function gradeQuiz(questions: Question[], answers: Record<string, unknown>, passPercent: number) {
  if (questions.some(q => typeof answers[q.id] !== 'number')) return null
  const wrong = questions.filter(q => answers[q.id] !== q.answer).map(q => q.id)
  const percent = Math.round(((questions.length - wrong.length) / questions.length) * 100)
  return { percent, passed: percent >= passPercent, wrong }
}

// ── expiry notices: 14 days before, and again on May 1 ──

export type NoticeKind = 'd14' | 'may1'
const DAY = 86_400_000
const ny = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)).split('-').map(Number) as [number, number, number]

/**
 * Which notice is due today for a badge that expires at `expiresMs`. The May 1 notice goes out on May 1 to 3 (so a missed run still
 * sends it) and only to badges that expire that June 30. `sent` holds the kinds already sent for this exact expiry.
 */
export function noticeDue(expiresMs: number, now: number, sent: ReadonlySet<string>): NoticeKind | null {
  if (now >= expiresMs) return null
  if (expiresMs - now <= 14 * DAY && !sent.has('d14')) return 'd14'
  const [y, m, d] = ny(now)
  if (m === 5 && d <= 3 && y === yearInNy(expiresMs) && !sent.has('may1')) return 'may1'
  return null
}

// ── CSV ──

/** One CSV cell. Cells that start with = + - @ get a leading ' so spreadsheets do not run them as formulas. */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',')
export const toCsv = (header: string[], rows: unknown[][]) => [csvRow(header), ...rows.map(csvRow)].join('\r\n') + '\r\n'

/** Who may run a session: a Director or an Admin. */
export const isTrainerLevel = (level: string | undefined | null) => level === 'director' || level === 'admin'

// ── who may do what (the routes call these, so the tests cover the same decisions) ──

export type Gate = { ok: true } | { ok: false; status: number; code: string; message: string }
const no = (status: number, code: string, message: string): Gate => ({ ok: false, status, code, message })

/** Every Studio route: Guests get 403 BR-PERM-001. */
export const memberGate = (level: string): Gate =>
  level === 'guest' ? no(403, 'BR-PERM-001', 'This is for Babson, Olin and Wellesley students.') : { ok: true }

export interface AttendanceLike { checkedInAt?: number | null; removedAt?: number | null; confirmedAt?: number | null }

/** Checking in: a verified Student, an open session, not removed, and only once per session. */
export function checkinGate(i: { level: string; emailVerified: boolean; demo: boolean; status: SessionStatus; row: AttendanceLike | null }): Gate {
  const m = memberGate(i.level)
  if (!m.ok) return m
  if (i.level !== 'student') return no(403, 'BR-STU-012', `${roleLabel('director')} members and admins do not need to check in.`)
  if (!i.emailVerified && !i.demo) return no(403, 'BR-STU-002', 'Verify your school email first.')
  if (i.status !== 'checkin_open') return no(409, 'BR-STU-004', 'Check-in is not open for this session.')
  if (i.row?.removedAt != null) return no(403, 'BR-STU-008', 'You were removed from this session. Ask the trainer.')
  if (i.row?.checkedInAt != null) return no(409, 'BR-STU-007', 'You are already checked in.')
  return { ok: true }
}

/** Saving a spot: any member with a verified school email (the demo account excepted). */
export function verifiedGate(i: { level: string; emailVerified: boolean; demo: boolean }): Gate {
  const m = memberGate(i.level)
  if (!m.ok) return m
  return !i.emailVerified && !i.demo ? no(403, 'BR-STU-002', 'Verify your school email first.') : { ok: true }
}

/** The quiz, the agreement and any grant need a row the trainer confirmed for this session. */
export function quizGate(i: { level: string; emailVerified: boolean; demo: boolean; row: AttendanceLike | null }): Gate {
  const v = verifiedGate(i)
  if (!v.ok) return v
  if (!i.row || i.row.confirmedAt == null || i.row.removedAt != null) return no(403, 'BR-STU-013', 'The trainer has not confirmed your attendance at this session yet.')
  return { ok: true }
}
