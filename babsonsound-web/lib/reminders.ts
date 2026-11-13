// Show reminders for hosts: which ones are due right now, what they say, and how a moved show is handled. Pure (no server imports) so the tests can run it.
// A reminder is for one person and one show (or studio booking). It is sent at most once: the server writes reminderLog/{showKey_kind_uid} first.
import { nyParts, nyToMs } from './slotAuto.ts'

export const REMINDER_HORIZON_MS = 40 * 3_600_000 // the day-before reminder (9 am the day before) can be up to 39 hours ahead of a late show
export const HOUR_MS = 3_600_000
export const DAY_GRACE_MS = 3 * HOUR_MS // a day-before reminder that is more than this late is skipped (the show was booked after 9 am the day before)

export type ReminderKind = 'dayBefore' | 'hourBefore' | 'quarter' | 'moved'

/** What each person chose. Everything is on until they turn it off. Stored on the user as showReminders (users.reminders already holds the schedule bells). */
export interface ReminderPrefs { email: boolean; push: boolean; dayBefore: boolean; hourBefore: boolean; bookingQuarter: boolean }
export const DEFAULT_PREFS: ReminderPrefs = { email: true, push: true, dayBefore: true, hourBefore: true, bookingQuarter: true }
const PREF_KEYS = Object.keys(DEFAULT_PREFS) as (keyof ReminderPrefs)[]

/** Stored value to settings. Anything missing or not a true/false is the default (on). */
export function readPrefs(v: unknown): ReminderPrefs {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  const out = { ...DEFAULT_PREFS }
  for (const k of PREF_KEYS) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean
  return out
}

/** A change from the settings screen: only the known true/false fields. Unknown or non-boolean fields are refused so a typo never silently does nothing. */
export function patchPrefs(cur: ReminderPrefs, body: unknown): { ok: true; prefs: ReminderPrefs } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'Send the reminder settings as an object.' }
  const next = { ...cur }
  let n = 0
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (!PREF_KEYS.includes(k as keyof ReminderPrefs)) return { ok: false, message: `Unknown reminder setting “${k.slice(0, 30)}”.` }
    if (typeof v !== 'boolean') return { ok: false, message: `“${k}” must be on or off.` }
    next[k as keyof ReminderPrefs] = v; n++
  }
  return n ? { ok: true, prefs: next } : { ok: false, message: 'Nothing to change.' }
}

/** One thing a host is reminded about: a one-off show (slot), a weekly show's next airing, or a studio booking. */
export interface Occurrence {
  /** Stable id for the log. One-offs keep the same key when they move; a weekly airing includes its start time. */
  key: string
  kind: 'slot' | 'weekly' | 'booking'
  title: string
  startAt: number
  hostUids: string[]
  /** Does the host go to the studio (live shows, weekly shows, bookings)? Pre-recorded shows do not. */
  studio: boolean
}
/** What the log says was sent: id -> the start time that reminder was for. */
export type LogMap = Record<string, { startAt: number }>

export const reminderId = (key: string, kind: Exclude<ReminderKind, 'moved'>, uid: string) => `${key}_${kind}_${uid}`
export const movedId = (key: string, startAt: number, uid: string) => `${key}_moved${startAt}_${uid}`

/** 9:00 in New York on the calendar day before the show. */
export function dayBeforeAt(startAt: number): number {
  const p = nyParts(startAt)
  return nyToMs(p.y, p.m, p.d - 1, 9, 0)
}
export const triggerAt = (startAt: number, kind: Exclude<ReminderKind, 'moved'>) =>
  kind === 'dayBefore' ? dayBeforeAt(startAt) : kind === 'hourBefore' ? startAt - HOUR_MS : startAt - 15 * 60_000

export interface Due { id: string; key: string; kind: ReminderKind; uid: string; startAt: number; title: string; studio: boolean; booking: boolean; email: boolean; push: boolean; prevStartAt?: number }

const wants = (p: ReminderPrefs, kind: ReminderKind) =>
  kind === 'dayBefore' ? p.dayBefore : kind === 'hourBefore' ? p.hourBefore : kind === 'quarter' ? p.bookingQuarter : p.dayBefore || p.hourBefore || p.bookingQuarter

/** The ids the server needs to look up in the log for this occurrence and person (so it reads only these). */
export function logIdsFor(o: Occurrence, uid: string): string[] {
  const ids = (['dayBefore', 'hourBefore'] as const).map(k => reminderId(o.key, k, uid))
  if (o.kind === 'booking') ids.push(reminderId(o.key, 'quarter', uid))
  if (o.kind !== 'weekly') ids.push(movedId(o.key, o.startAt, uid))
  return ids
}

/**
 * Which reminders should go out right now. `prefs` maps uid to that person's settings and `canEmail` says whether their email can be used (not unsubscribed, has an address).
 * - Never for anything past or already started, and a person without a channel or the kind turned off gets nothing.
 * - A reminder is only due after its trigger time (day before 9:00 New York, 1 hour before, 15 minutes before for a studio booking) and only while no closer trigger has passed:
 *   once the 1-hour mark has passed the day-before one is no longer sent, so a late cron run never sends two reminders at once.
 * - A day-before reminder more than DAY_GRACE_MS late is skipped (the show was booked after 9 am the day before).
 * - Already logged for this start time = not sent again. A log for an older start time (the show moved) does not count.
 * - A one-off that moved after a reminder was sent gets one short "moved" message for the new time instead of a stale reminder, and the usual reminders resume for the new time.
 */
export function dueReminders(occ: Occurrence[], logs: LogMap, prefs: Record<string, ReminderPrefs>, canEmail: Record<string, boolean>, now: number): Due[] {
  const out: Due[] = []
  for (const o of occ) {
    if (!(o.startAt > now)) continue
    for (const uid of new Set(o.hostUids)) {
      const p = prefs[uid]
      if (!p) continue
      const email = p.email && canEmail[uid] === true, push = p.push
      if (!email && !push) continue
      const base = { key: o.key, uid, startAt: o.startAt, title: o.title, studio: o.studio, booking: o.kind === 'booking', email, push }
      const sentFor = (id: string) => logs[id]?.startAt === o.startAt
      const kinds: Exclude<ReminderKind, 'moved'>[] = o.kind === 'booking' ? ['dayBefore', 'hourBefore', 'quarter'] : ['dayBefore', 'hourBefore']

      // Moved after a reminder went out for an older time.
      if (o.kind !== 'weekly') {
        const old = kinds.map(k => logs[reminderId(o.key, k, uid)]?.startAt).find(s => typeof s === 'number' && s !== o.startAt)
        if (old !== undefined && !sentFor(movedId(o.key, o.startAt, uid))) {
          if (wants(p, 'moved')) out.push({ ...base, id: movedId(o.key, o.startAt, uid), kind: 'moved', prevStartAt: old })
          continue // the usual reminders for the new time start on the next run
        }
      }

      // The closest kind whose trigger has passed is the only one that can be due.
      const passed = kinds.filter(k => now >= triggerAt(o.startAt, k))
      const k = passed[passed.length - 1]
      if (!k || !wants(p, k)) continue
      if (k === 'hourBefore' && now >= o.startAt - 5 * 60_000) continue // too close to be useful (a booking has its own 15-minute one)
      if (k === 'dayBefore' && now > triggerAt(o.startAt, 'dayBefore') + DAY_GRACE_MS) continue
      const id = reminderId(o.key, k, uid)
      if (!sentFor(id)) out.push({ ...base, id, kind: k })
    }
  }
  return out
}

// ── wording ──────────────────────────────────────────────────
/** "Tue, Nov 17 at 8:00 PM ET" */
export const whenShort = (ms: number) =>
  new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).replace(',', ',').replace(/, (\d+:\d+ [AP]M)$/, ' at $1') + ' ET'

export function reminderText(d: Pick<Due, 'kind' | 'title' | 'startAt' | 'studio' | 'booking' | 'prevStartAt'>) {
  const what = d.booking ? 'studio booking' : 'show'
  const name = d.booking ? 'Studio booking' : d.title
  const when = whenShort(d.startAt)
  const place = d.studio ? 'Studio: PMC basement' : ''
  switch (d.kind) {
    case 'dayBefore': return { subject: `Tomorrow: ${name}`, push: { title: `Tomorrow: ${name}`, body: when }, lead: `Your ${what} “${name}” is tomorrow: ${when}.`, place }
    case 'hourBefore': return { subject: `${name} starts in 1 hour`, push: { title: `${name} starts in 1 hour`, body: when }, lead: `Your ${what} “${name}” starts in about an hour: ${when}.`, place }
    case 'quarter': return { subject: 'Your studio booking starts in 15 minutes', push: { title: 'Studio booking in 15 minutes', body: 'Check in at the studio now.' }, lead: `Check-in is open. Your studio booking starts at ${when}.`, place }
    default: return { subject: `Your ${what} moved to ${when}`, push: { title: `Your ${what} moved`, body: `${name}: now ${when}` }, lead: `Your ${what} “${name}” moved to ${when}.`, place }
  }
}
