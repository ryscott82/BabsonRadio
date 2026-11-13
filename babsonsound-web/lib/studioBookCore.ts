import { nyParts } from './slotAuto.ts'

// Studio booking rules, pure (no database), shared by the routes, the settings table and the tests.
// Times are instants (ms). "Station time" is New York, like every other schedule rule on the site.

export const STUDIO_STEP_MIN = 30
export const LIVE_MAX_MINUTES = 90
/** Stored with every request and booking that was made with the policy box ticked. */
export const POLICY_VERSION = '2026-11-12'
export const QUIET_WARNING = 'Quiet hours: no loud DJ sets, keep the volume as low as possible'
export const GUEST_KEEP_DAYS = 90

export interface StudioRules {
  capacity: number; openHour: number; closeHour: number; minMinutes: number; maxMinutes: number; maxHolds: number
  lookAheadDays: number; cancelHours: number; graceMinutes: number; quiet: string
  studioNoShow: boolean; semesterEnd: string; lateCancelHours: number
}
export const DEFAULT_STUDIO: StudioRules = {
  capacity: 12, openHour: 7, closeHour: 23, minMinutes: 30, maxMinutes: 90, maxHolds: 2, lookAheadDays: 30, cancelHours: 2, graceMinutes: 15,
  quiet: 'Mon-Fri 10-16:30; Mon-Fri 23-7; Sat-Sun 2-8', studioNoShow: false, semesterEnd: '2026-12-18', lateCancelHours: 24,
}
export type StudioNumKey = 'capacity' | 'openHour' | 'closeHour' | 'minMinutes' | 'maxMinutes' | 'maxHolds' | 'lookAheadDays' | 'cancelHours' | 'graceMinutes' | 'lateCancelHours'
export const STUDIO_RANGE: Record<StudioNumKey, [number, number]> = {
  capacity: [1, 50], openHour: [0, 23], closeHour: [1, 24], minMinutes: [30, 240], maxMinutes: [30, 480], maxHolds: [1, 10],
  lookAheadDays: [1, 120], cancelHours: [0, 72], graceMinutes: [0, 120], lateCancelHours: [0, 168],
}
export const STUDIO_NUM_KEYS = Object.keys(STUDIO_RANGE) as StudioNumKey[]

// ── quiet hours ─────────────────────────────────────────────
// "Mon-Fri 10-16:30; Mon-Fri 23-7; Sat-Sun 2-8": day or day range, then an hour range (hours can have minutes, like 16:30). Each rule applies on the calendar days it lists (hours 0 to 24; a range that ends
// before it starts, like 22-7, means from the start hour to midnight and from midnight to the end hour on each listed day).
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export interface QuietRule { days: number[]; from: number; to: number }

export function parseQuiet(spec: string): QuietRule[] | null {
  const out: QuietRule[] = []
  const text = spec.trim()
  if (!text) return out
  for (const part of text.split(';')) {
    const m = part.trim().match(/^([A-Za-z]{3})(?:-([A-Za-z]{3}))?\s+(\d{1,2}(?::[0-5]\d)?)-(\d{1,2}(?::[0-5]\d)?)$/)
    if (!m) return null
    const a = DAYS.findIndex(d => d.toLowerCase() === m[1].toLowerCase())
    const b = m[2] ? DAYS.findIndex(d => d.toLowerCase() === m[2].toLowerCase()) : a
    const hr = (t: string) => { const [h, mi = '0'] = t.split(':'); return Number(h) + Number(mi) / 60 } // 9, or 16:30 for half past four
    const from = hr(m[3]), to = hr(m[4])
    if (a < 0 || b < 0 || from > 24 || to > 24 || from === to) return null
    const days: number[] = []
    for (let d = a; ; d = (d + 1) % 7) { days.push(d); if (d === b) break }
    out.push({ days, from, to })
  }
  return out.length > 12 ? null : out
}

/** An error sentence for a bad quiet-hours text, or null. */
export const checkQuietSpec = (spec: string): string | null => (parseQuiet(spec) ? null : 'Use days and hours like "Mon-Fri 10-16:30; Mon-Fri 23-7; Sat-Sun 2-8" (hours 0 to 24, minutes optional like 16:30).')

export function quietAt(spec: string, ms: number): boolean {
  const rules = parseQuiet(spec)
  if (!rules?.length) return false
  const p = nyParts(ms)
  const h = p.h + p.min / 60
  return rules.some(r => r.days.includes(p.dow) && (r.from < r.to ? h >= r.from && h < r.to : h >= r.from || h < r.to))
}

/** True when any part of [start, end) is inside quiet hours (checked every 15 minutes). */
export function quietDuring(spec: string, startMs: number, endMs: number): boolean {
  for (let t = startMs; t < endMs; t += 15 * 60_000) if (quietAt(spec, t)) return true
  return false
}

/** When quiet hours that cover `ms` end (a 15-minute mark), or null when it is not quiet now or never ends within two days. */
export function quietUntil(spec: string, ms: number): number | null {
  if (!quietAt(spec, ms)) return null
  const base = Math.floor(ms / (15 * 60_000)) * 15 * 60_000
  for (let t = base + 15 * 60_000; t <= ms + 48 * 3_600_000; t += 15 * 60_000) if (!quietAt(spec, t)) return t
  return null
}

/** When quiet hours next begin (a 15-minute mark), or null when it is quiet now or no quiet hours start within two days. */
export function quietNextStart(spec: string, ms: number): number | null {
  if (quietAt(spec, ms)) return null
  const base = Math.floor(ms / (15 * 60_000)) * 15 * 60_000
  for (let t = base + 15 * 60_000; t <= ms + 48 * 3_600_000; t += 15 * 60_000) if (quietAt(spec, t)) return t
  return null
}

/** The quiet stretches inside a window, merged, for shading the grid. */
export function quietRanges(spec: string, fromMs: number, toMs: number): { startAt: number; endAt: number }[] {
  const out: { startAt: number; endAt: number }[] = []
  let open: number | null = null
  const first = Math.floor(fromMs / (15 * 60_000)) * 15 * 60_000
  for (let t = first; t < toMs; t += 15 * 60_000) {
    const q = quietAt(spec, t)
    if (q && open === null) open = Math.max(t, fromMs)
    if (!q && open !== null) { out.push({ startAt: open, endAt: t }); open = null }
  }
  if (open !== null) out.push({ startAt: open, endAt: toMs })
  return out
}

/** { quiet, warning } for a block of time: the sentence is empty when the block is not in quiet hours. */
export const quietInfo = (spec: string, startMs: number, endMs: number) => {
  const quiet = quietDuring(spec, startMs, endMs)
  return { quiet, warning: quiet ? QUIET_WARNING : '' }
}

// ── rules read from the saved document ─────────────────────
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export const isIsoDate = (s: unknown): s is string => typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)

/** Anything missing or out of range uses the default (same idea as lib/slotRulesCore.ts). */
export function readStudioRules(raw: unknown): StudioRules {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: StudioRules = { ...DEFAULT_STUDIO }
  for (const k of STUDIO_NUM_KEYS) {
    const v = d[k], [lo, hi] = STUDIO_RANGE[k]
    if (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi) out[k] = v
  }
  if (out.closeHour <= out.openHour) { out.openHour = DEFAULT_STUDIO.openHour; out.closeHour = DEFAULT_STUDIO.closeHour }
  if (out.maxMinutes < out.minMinutes) { out.minMinutes = DEFAULT_STUDIO.minMinutes; out.maxMinutes = DEFAULT_STUDIO.maxMinutes }
  if (typeof d.quiet === 'string' && parseQuiet(d.quiet)) out.quiet = d.quiet.trim()
  if (typeof d.studioNoShow === 'boolean') out.studioNoShow = d.studioNoShow
  if (isIsoDate(d.semesterEnd)) out.semesterEnd = d.semesterEnd
  return out
}

// ── one booking ────────────────────────────────────────────
export interface Problem { status: number; message: string; code?: string }
const bad = (message: string, status = 400, code?: string): Problem => ({ status, message, code })

/** The rules for a new studio booking that need no database: step, length, opening hours, look-ahead. Returns the first problem or null. */
export function checkBookingTime(i: { startMs: number; durationMin: number; now: number; rules: StudioRules }): Problem | null {
  const { startMs, durationMin, now, rules } = i
  if (!Number.isFinite(startMs) || !Number.isFinite(durationMin)) return bad('Pick a start time and length.')
  if (startMs % (STUDIO_STEP_MIN * 60_000) !== 0) return bad(`Start on the hour or half hour.`)
  if (durationMin % STUDIO_STEP_MIN !== 0 || durationMin < rules.minMinutes || durationMin > rules.maxMinutes) {
    return bad(`Book ${rules.minMinutes} to ${rules.maxMinutes} minutes, in ${STUDIO_STEP_MIN}-minute steps.`)
  }
  if (startMs < now) return bad('That time has already started. Pick a later time.')
  if (startMs > now + rules.lookAheadDays * 86_400_000) return bad(`You can book up to ${rules.lookAheadDays} days ahead.`)
  const a = nyParts(startMs), b = nyParts(startMs + durationMin * 60_000 - 1)
  const open = rules.openHour * 60, close = rules.closeHour * 60
  const sameDay = a.y === b.y && a.m === b.m && a.d === b.d
  if (!sameDay || a.h * 60 + a.min < open || b.h * 60 + b.min + 1 > close) return bad(`The studio can be booked from ${hourText(rules.openHour)} to ${hourText(rules.closeHour)}.`)
  return null
}

export const hourText = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h % 24 < 12 ? 'AM' : 'PM'}`

/** People in the room, including the booker, against the capacity. `guests` is how many others are coming. */
export const withinCapacity = (guests: number, capacity: number) => guests + 1 <= capacity

export const overlaps = (a: { startAt: number; endAt: number }, b: { startAt: number; endAt: number }) => a.startAt < b.endAt && b.startAt < a.endAt

export interface BookingLike { status: string; startAt: number; endAt: number }
/** Bookings that hold the room (and count toward the limit of upcoming bookings). */
export const holdsRoom = (b: BookingLike) => b.status === 'booked' || b.status === 'checked-in'
/** Upcoming bookings a person holds. Live shows are not bookings, so they never count. */
export const upcomingHeld = (mine: BookingLike[], now: number) => mine.filter(b => holdsRoom(b) && b.endAt > now).length

export const freeCancel = (startMs: number, now: number, cancelHours: number) => startMs - now >= cancelHours * 3_600_000

/** A booked block nobody checked in to, past the grace period: it frees itself. */
export const isReleasable = (b: { status: string; startAt: number }, now: number, graceMinutes: number) => b.status === 'booked' && now >= b.startAt + graceMinutes * 60_000

// ── live shows ─────────────────────────────────────────────
/** Live shows are capped at 90 minutes. Pre-recorded shows keep the normal length cap. Returns an error sentence or null. */
export function liveLengthError(type: string, durationMin: number): string | null {
  return type === 'live' && durationMin > LIVE_MAX_MINUTES ? `Live shows can be up to ${LIVE_MAX_MINUTES} minutes. Pick a shorter length, or make it a pre-recorded show.` : null
}
/** Does this show hold the studio? Live shows do unless the request says noStudio. Pre-recorded shows never do. */
export const holdsStudio = (s: { type: string; noStudio?: unknown }) => s.type === 'live' && s.noStudio !== true

// ── guests ─────────────────────────────────────────────────
export interface Guest { name: string; email: string; uid?: string }
/** A guest as sent by a client: typed (name and email) or picked from the suggestions (id; the server looks up the real email). */
export interface GuestInput { name: string; email: string; id?: string }
export const GUEST_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/

export type GuestsResult = { ok: true; justMe: boolean; guests: GuestInput[] } | { ok: false; error: string }
/** Needs a guest list or "just me". Valid email format, name 1 to 60 characters, no repeats, at most capacity minus one guests. */
export function cleanGuests(rawGuests: unknown, rawJustMe: unknown, capacity: number): GuestsResult {
  const justMe = rawJustMe === true
  const list = Array.isArray(rawGuests) ? rawGuests : rawGuests == null ? [] : null
  if (list === null) return { ok: false, error: 'Send the guests as a list.' }
  if (justMe && list.length) return { ok: false, error: 'Choose "just me" or list who is coming, not both.' }
  if (!justMe && !list.length) return { ok: false, error: 'Add who is coming with you, or tick "just me".' }
  if (list.length > capacity - 1) return { ok: false, error: `With you in the room, at most ${capacity} people fit, so add up to ${capacity - 1} guests.` }
  const seen = new Set<string>(), out: GuestInput[] = []
  for (const g of list) {
    if (!g || typeof g !== 'object') return { ok: false, error: 'Each guest needs a name and an email.' }
    const r = g as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim().slice(0, 80) : ''
    const name = typeof r.name === 'string' ? r.name.trim().replace(/\s+/g, ' ') : ''
    const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : ''
    if (!id) {
      if (name.length < 1 || name.length > 60) return { ok: false, error: 'Each guest name must be 1 to 60 characters.' }
      if (email.length > 120 || !GUEST_EMAIL.test(email)) return { ok: false, error: `"${name}" needs a valid email address.` }
    }
    const key = id ? `id:${id}` : `e:${email}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name: name.slice(0, 60), email, ...(id ? { id } : {}) })
  }
  return { ok: true, justMe, guests: out }
}

/** The day guest details are deleted: 90 days after the date of the booking or show. */
export const purgeAtMs = (startMs: number) => startMs + GUEST_KEEP_DAYS * 86_400_000

/** Who may read a guest list: E-board and Admin. A student sees only their own. */
export const canSeeGuests = (level: string, ownerUid: string, uid: string) => level === 'admin' || level === 'director' || ownerUid === uid

// ── suggestions ────────────────────────────────────────────
/** a***@b***.edu style mask: only the first letter of the name and of the domain, and the ending. Never the whole address. */
export function maskEmail(email: string): string {
  const [u, d = ''] = email.toLowerCase().split('@')
  const dot = d.lastIndexOf('.')
  const host = dot > 0 ? d.slice(0, dot) : d, tld = dot > 0 ? d.slice(dot) : ''
  return `${u.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`
}
export const nameLower = (first: unknown, last: unknown) => `${String(first ?? '')} ${String(last ?? '')}`.toLowerCase().replace(/\s+/g, ' ').trim()
