// Show-request rules that need no database: when a request approves itself, the one-auto-show-a-week limit (New York Mon to Sun),
// repeat weeks, the open-times view and the audio-link update. Plain functions (no server imports) so the tests can run them.
import { badgeActive } from './studioRules.ts'

export const AUTO = {
  /** A pending request approves itself this long after it was made, unless that is later than start - beforeStartHours. */
  afterHours: 24,
  beforeStartHours: 12,
  /** Shows a person can have auto-approved in the same Monday to Sunday week (New York). More wait for staff. */
  weekLimit: 1,
  maxRepeatWeeks: 3,
  maxOpenDays: 14,
  optionsWeeks: 4,
} as const

/** The show-request numbers an Admin can change (Admin > Settings). Saved in config/slotRules; these are the defaults and what is used until something is saved. */
export interface AutoRules { afterHours: number; beforeStartHours: number; weekLimit: number; maxRepeatWeeks: number; minLeadHours: number }
export const DEFAULT_AUTO_RULES: AutoRules = { afterHours: AUTO.afterHours, beforeStartHours: AUTO.beforeStartHours, weekLimit: AUTO.weekLimit, maxRepeatWeeks: AUTO.maxRepeatWeeks, minLeadHours: 24 }

const HOUR = 3_600_000
export const autoApproveAtMs = (createdMs: number, startMs: number, rules: Pick<AutoRules, 'afterHours' | 'beforeStartHours'> = DEFAULT_AUTO_RULES) =>
  Math.min(createdMs + rules.afterHours * HOUR, startMs - rules.beforeStartHours * HOUR)

// ── New York calendar ──
const TZ = 'America/New_York'
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' })

export function nyParts(ms: number) {
  const o: Record<string, string> = {}
  for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day), h: Number(o.hour), min: Number(o.minute), dow: DOW[o.weekday] ?? 0 }
}

/** How far New York is from UTC at that moment, in ms (negative). */
function tzOffsetMs(ms: number) {
  const p = nyParts(ms)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(ms / 60_000) * 60_000
}

/** The instant for a New York wall-clock time. */
export function nyToMs(y: number, m: number, d: number, h: number, min: number) {
  const guess = Date.UTC(y, m - 1, d, h, min)
  const off = tzOffsetMs(guess)
  const r = guess - off
  const off2 = tzOffsetMs(r)
  return off2 === off ? r : guess - off2
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

/** The Monday (New York date, YYYY-MM-DD) of the Monday to Sunday week the instant falls in. A week changes at Sunday midnight New York, DST included. */
export function nyWeekKey(ms: number) {
  const p = nyParts(ms)
  return iso(Date.UTC(p.y, p.m - 1, p.d - ((p.dow + 6) % 7)))
}

/** This week's key and the next n-1. */
export function weekKeysFrom(nowMs: number, n: number = AUTO.optionsWeeks) {
  const first = nyWeekKey(nowMs)
  const [y, m, d] = first.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => iso(Date.UTC(y, m - 1, d + 7 * i)))
}

/** The same New York wall-clock time `weeks` weeks later (a show at 8 pm stays at 8 pm across a clock change). */
export function addWeeksWallClock(startMs: number, weeks: number) {
  const p = nyParts(startMs)
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + 7 * weeks))
  return nyToMs(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), p.h, p.min)
}

/** Starts for the extra weeks (week 1, 2, ... after the first). */
export const repeatStarts = (startMs: number, weeks: number) => Array.from({ length: weeks }, (_, i) => addWeeksWallClock(startMs, i + 1))

export function cleanWeeks(v: unknown, max: number = DEFAULT_AUTO_RULES.maxRepeatWeeks): number | null {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null
}

// ── auto-approval ──
export type Requester = { level: string; conductVersion: unknown; radioTrained: boolean; radioExpiresAt: number | null }

/** Directors and admins always count as trained; a student needs the radio badge and it must not have ended. */
export const radioTrainedFromProfile = (p: { level: string; radioTrained: boolean; radioExpiresAt: number | null }, now: number) =>
  p.level === 'director' || p.level === 'admin' || (p.level === 'student' && p.radioTrained === true && badgeActive(p.radioExpiresAt, now))

/** Could this request ever approve itself? Worked out when it is made and again when it comes due. */
export const autoEligible = (i: { type: string; conductSigned: boolean; radioTrained: boolean }) =>
  i.conductSigned && (i.type !== 'live' || i.radioTrained)

export type BlockReason = 'week-limit' | 'agreement' | 'training' | 'conflict' | 'past' | 'ineligible'
export type AutoVerdict = { action: 'approve' } | { action: 'wait' } | { action: 'skip'; reason: BlockReason | 'held' | 'not-pending' }

export function evaluateAuto(i: {
  now: number; status: string; held: boolean; autoApproveAt: number | null; startMs: number; type: string
  requester: Requester; conductVersion: string
  /** airSlots this person already has with approvedBy 'auto' in the same New York week as this show */
  autoStartsInWeek: number
  /** another approved slot overlaps this time */
  conflict: boolean
  /** the saved limits; the defaults when left out */
  rules?: Pick<AutoRules, 'weekLimit'>
}): AutoVerdict {
  if (i.status !== 'pending') return { action: 'skip', reason: 'not-pending' }
  if (i.held) return { action: 'skip', reason: 'held' }
  if (i.autoApproveAt == null || i.autoApproveAt > i.now) return { action: 'wait' }
  if (i.requester.level === 'guest') return { action: 'skip', reason: 'ineligible' }
  if (i.requester.conductVersion !== i.conductVersion) return { action: 'skip', reason: 'agreement' }
  if (i.type === 'live' && !radioTrainedFromProfile(i.requester, i.now)) return { action: 'skip', reason: 'training' }
  if (i.startMs <= i.now) return { action: 'skip', reason: 'past' }
  if (i.conflict) return { action: 'skip', reason: 'conflict' }
  if (i.autoStartsInWeek >= (i.rules ?? DEFAULT_AUTO_RULES).weekLimit) return { action: 'skip', reason: 'week-limit' }
  return { action: 'approve' }
}

/** Starts of the bookings that were approved automatically. A show a person approved by hand never uses the week's automatic slot. */
export const autoStartsOf = (slots: { approvedBy?: unknown; startAt: number }[]) => slots.filter(s => s.approvedBy === 'auto').map(s => s.startAt)

/** Auto-approved starts for this person that fall in the same week as `startMs`. */
export const autoStartsInSameWeek = (autoStarts: number[], startMs: number) => {
  const wk = nyWeekKey(startMs)
  return autoStarts.filter(s => nyWeekKey(s) === wk).length
}

/** A pending request counts once per group (a repeat group is one pending request). */
export const pendingCount = (docs: { id: string; status: string; groupId?: string | null }[]) =>
  new Set(docs.filter(d => d.status === 'pending').map(d => d.groupId || d.id)).size

// ── open times ──
export type OpenRange = { startAt: number; endAt: number; pending: boolean }

/** Only times: no names, titles or ids. Booked airSlots plus pending requests (the caller leaves out nothing; the answer is the same for everyone). */
export function toOpenRanges(booked: { startAt: number; endAt: number }[], pending: { startAt: number; endAt: number }[], from: number, to: number): OpenRange[] {
  const keep = (r: { startAt: number; endAt: number }) => r.endAt > from && r.startAt < to
  return [
    ...booked.filter(keep).map(r => ({ startAt: r.startAt, endAt: r.endAt, pending: false })),
    ...pending.filter(keep).map(r => ({ startAt: r.startAt, endAt: r.endAt, pending: true })),
  ].sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt)
}

/** The window to show: at most 14 days. Returns null when from/to are not usable. */
export function openWindow(fromRaw: unknown, toRaw: unknown, now: number): { from: number; to: number } | null {
  const from = fromRaw == null || fromRaw === '' ? now : Number(fromRaw)
  if (!Number.isFinite(from)) return null
  const max = AUTO.maxOpenDays * 86_400_000
  const to = toRaw == null || toRaw === '' ? from + max : Number(toRaw)
  if (!Number.isFinite(to) || to <= from) return null
  return { from, to: Math.min(to, from + max) }
}

// ── audio link ──
export function checkAudioUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return 'That audio link is not a valid URL.' }
  return u.protocol === 'https:' ? null : 'Audio links must start with https://'
}

/** Can this person change this request's audio link? 404 for somebody else's request, so ownership is not revealed. */
export function checkAudioUpdate(i: { ownerUid: string; uid: string; type: string; status: string; startMs: number; now: number; audioURL: string }):
  { ok: true } | { ok: false; status: number; message: string } {
  if (i.ownerUid !== i.uid) return { ok: false, status: 404, message: 'Request not found.' }
  if (i.type !== 'prerecorded') return { ok: false, status: 400, message: 'An audio link only applies to pre-recorded shows.' }
  if (i.status !== 'pending' && i.status !== 'approved') return { ok: false, status: 409, message: 'This request can no longer be changed.' }
  if (i.startMs <= i.now) return { ok: false, status: 400, message: 'That show has already started.' }
  const bad = checkAudioUrl(i.audioURL)
  return bad ? { ok: false, status: 400, message: bad } : { ok: true }
}
