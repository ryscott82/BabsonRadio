import { DEFAULT_REFRESH_SEC } from './liveBundle.ts'

// Listening limits, set separately for students (directors and admins use the student settings) and guests. Pure, so the server, the admin
// page and the tests share it. 0 means "no limit" for every number except the quiet hours, which have their own on/off switch.

export interface Audience {
  /** Ask "still listening?" after this many minutes without any activity (the page or app does it, not the server). 0 = never ask. */
  idleMin: number
  /** Stop a listening session after this many minutes in a row (the page or app does it, not the server). Default 6 hours. 0 = no limit. */
  sessionMaxMin: number
  /** Most minutes of listening a day (live shows and playlists together). 0 = no limit. */
  dailyCapMin: number
  /** Most minutes of playlist (no live show) listening a day. Live shows still play. 0 = no limit. */
  dailyAutoMin: number
  /** Overnight sleep: no playlist listening between these local hours (0-23) unless a show is on. */
  quietEnabled: boolean
  quietStart: number
  quietEnd: number
}
export interface Limits {
  /** Also apply the old monthly listener-hours budget (it tightens the numbers above as the month fills up). Off now that hosting has no hour limit. */
  budgetEnabled: boolean
  /** Seconds between a listening page's check-ins (2 to 60 minutes; default 12). Sent back by the check-in, so it changes without an app update. */
  refreshSec: number
  student: Audience
  guest: Audience
}

export const DEFAULT_AUDIENCE: Audience = { idleMin: 60, sessionMaxMin: 360, dailyCapMin: 0, dailyAutoMin: 0, quietEnabled: true, quietStart: 2, quietEnd: 6 }
export const DEFAULT_LIMITS: Limits = { budgetEnabled: false, refreshSec: DEFAULT_REFRESH_SEC, student: DEFAULT_AUDIENCE, guest: DEFAULT_AUDIENCE }

/** What the apps are told when "still listening?" is off. */
export const NEVER_MIN = 100_000

const RANGE: Record<'idleMin' | 'sessionMaxMin' | 'dailyCapMin' | 'dailyAutoMin' | 'quietStart' | 'quietEnd', [number, number]> = {
  idleMin: [0, 1440], sessionMaxMin: [0, 10080], dailyCapMin: [0, 1440], dailyAutoMin: [0, 1440], quietStart: [0, 23], quietEnd: [0, 23],
}

/** A whole number inside the allowed range, or the fallback when it is missing or out of range. */
const pick = (v: unknown, [lo, hi]: [number, number], fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : fallback)

/** Reads one audience from stored or posted data; anything missing or out of range falls back to `base`. */
export function cleanAudience(raw: unknown, base: Audience = DEFAULT_AUDIENCE): Audience {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    idleMin: pick(d.idleMin, RANGE.idleMin, base.idleMin), sessionMaxMin: pick(d.sessionMaxMin, RANGE.sessionMaxMin, base.sessionMaxMin),
    dailyCapMin: pick(d.dailyCapMin, RANGE.dailyCapMin, base.dailyCapMin), dailyAutoMin: pick(d.dailyAutoMin, RANGE.dailyAutoMin, base.dailyAutoMin),
    quietEnabled: typeof d.quietEnabled === 'boolean' ? d.quietEnabled : base.quietEnabled,
    quietStart: pick(d.quietStart, RANGE.quietStart, base.quietStart), quietEnd: pick(d.quietEnd, RANGE.quietEnd, base.quietEnd),
  }
}

/** True when a posted number is outside its allowed range (so the admin gets an error instead of a silent fallback). */
export function audienceErrors(raw: unknown): string[] {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return (Object.keys(RANGE) as (keyof typeof RANGE)[]).filter(k => d[k] !== undefined && pick(d[k], RANGE[k], -1) === -1)
}

/** The smaller of two limits where 0 / null means "none". */
const tighter = (a: number, b: number | null) => (a > 0 && b != null && b > 0 ? Math.min(a, b) : a > 0 ? a : b != null && b > 0 ? b : 0)

/** The numbers the listening check uses: the audience's settings, tightened by the monthly budget when that is on. */
export function effectiveLimits(a: Audience, budget: { idleMin: number; sessionMaxMin: number; dailyCapMin: number | null } | null) {
  const idle = tighter(a.idleMin, budget?.idleMin ?? null)
  const session = tighter(a.sessionMaxMin, budget?.sessionMaxMin ?? null)
  const daily = tighter(a.dailyCapMin, budget?.dailyCapMin ?? null)
  return { idleMin: idle || NEVER_MIN, sessionMaxMin: session || 0, dailyCapMin: daily || 0 }
}

/** Overnight sleep: true while local hour `h` (0-23.99) is inside the audience's quiet hours. */
export function isQuiet(a: Pick<Audience, 'quietEnabled' | 'quietStart' | 'quietEnd'>, h: number): boolean {
  if (!a.quietEnabled || a.quietStart === a.quietEnd) return false
  return a.quietStart < a.quietEnd ? h >= a.quietStart && h < a.quietEnd : h >= a.quietStart || h < a.quietEnd
}

export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? 'pm' : 'am'}`
