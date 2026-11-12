import { nyParts, nyToMs } from './slotAuto.ts'
import { freeCancel } from './studioBookCore.ts'

// The studio booking grid, with no React and no server code: which blocks are free, how long a booking can be from a block, quiet hours, the
// limit on bookings. Times are instants (ms); days and hours are New York ("station time"), like the rest of the site.

export interface Range { startAt: number; endAt: number }
export const STEP_MIN = 30
export const MIN = 60_000

export const WALK_IN_NOTE = 'You do not need a booking to use the studio when it is free. A booking just reserves it.'
export const QUIET_LINE = 'Quiet hours: no loud DJ sets, keep the volume as low as possible'

export const overlapsAny = (ranges: Range[], startMs: number, endMs: number) => ranges.some(r => r.startAt < endMs && startMs < r.endAt)

export interface Day { key: string; startMs: number; label: string; short: string }

/** The next `count` New York days, today first. */
export function days(now: number, count: number): Day[] {
  const p = nyParts(now)
  const today = nyToMs(p.y, p.m, p.d, 0, 0)
  const out: Day[] = []
  for (let i = 0; i < count; i++) {
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d + i))
    const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate()
    const startMs = i === 0 ? today : nyToMs(y, m, d, 0, 0)
    const wd = t.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    const md = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    out.push({ key: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, startMs, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${wd} ${md}`, short: `${wd} ${d}` })
  }
  return out
}

/** The block start times of a day (30-minute steps from the opening hour up to the closing hour). */
export function blocksOfDay(dayStartMs: number, openHour: number, closeHour: number, step = STEP_MIN): number[] {
  const p = nyParts(dayStartMs + 3_600_000) // an hour in, so a clock change at midnight cannot move the date
  const out: number[] = []
  for (let mins = openHour * 60; mins < closeHour * 60; mins += step) out.push(nyToMs(p.y, p.m, p.d, Math.floor(mins / 60), mins % 60))
  return out
}

export type BlockState = 'past' | 'taken' | 'far' | 'free'

export function blockState(startMs: number, o: { ranges: Range[]; now: number; lookAheadDays: number; step?: number }): BlockState {
  const step = (o.step ?? STEP_MIN) * MIN
  if (startMs < o.now) return 'past'
  if (startMs > o.now + o.lookAheadDays * 86_400_000) return 'far'
  return overlapsAny(o.ranges, startMs, startMs + step) ? 'taken' : 'free'
}

/** The longest booking (minutes) that can start at this block: stops at the next booking and at closing time, and never goes over the maximum. */
export function longestFrom(startMs: number, o: { ranges: Range[]; closeMs: number; maxMinutes: number; step?: number }): number {
  const step = o.step ?? STEP_MIN
  let len = 0
  while (len + step <= o.maxMinutes) {
    const e = startMs + (len + step) * MIN
    if (e > o.closeMs || overlapsAny(o.ranges, startMs + len * MIN, e)) break
    len += step
  }
  return len
}

/** The length chips to show (30, 60, 90 by default): only the lengths that fit. */
export function lengthChips(longest: number, minMinutes: number, maxMinutes: number): number[] {
  const out: number[] = []
  for (let m = Math.max(minMinutes, STEP_MIN); m <= maxMinutes && m <= 90; m += STEP_MIN) if (m <= longest) out.push(m)
  return out
}

/** The chip to select: keep the current length when it still fits, else the longest that fits. */
export const pickLength = (current: number, chips: number[]) => (chips.includes(current) ? current : chips[chips.length - 1] ?? 0)

/** True when any part of the block touches a quiet stretch. */
export const touchesQuiet = (quiet: Range[], startMs: number, endMs: number) => overlapsAny(quiet, startMs, endMs)

/** The one-line warning for a block, or '' (never blocks). */
export const quietWarning = (quiet: Range[], startMs: number, endMs: number) => (touchesQuiet(quiet, startMs, endMs) ? QUIET_LINE : '')

export interface HoldState { held: number; max: number; full: boolean; line: string }
/** Two bookings at a time: the line says where the person stands. Live shows never count. */
export function holdState(held: number, max: number): HoldState {
  const full = held >= max
  return { held, max, full, line: full ? `You have ${held} of ${max} bookings. Cancel one to book another.` : `You have ${held} of ${max} bookings.` }
}

export interface CancelInfo { canCancel: boolean; line: string }
/** Free to cancel until `cancelHours` before the start. After that the button still works, with a warning. */
export function cancelInfo(startMs: number, now: number, cancelHours: number): CancelInfo {
  if (startMs <= now) return { canCancel: false, line: '' }
  const free = freeCancel(startMs, now, cancelHours)
  return { canCancel: true, line: free ? `You can cancel until ${cancelHours} hours before.` : `Less than ${cancelHours} hours away. You can still cancel, and the E-board may be told.` }
}

/** 7 AM style hour label for the day list. */
export const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
