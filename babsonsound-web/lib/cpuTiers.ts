// Tiered throttling for server time. Pure (no server imports) so the tests can run it.
//
// Vercel's free plan pauses the site when its Active CPU allowance (4 hours a month) is used up, and we cannot pay for more.
// Features are sorted into tiers by how much the station needs them:
//   Tier 0  the stream, now playing and the cached schedule. Never limited, so it has no entry here.
//   Tier 1  sign-in and /api/me. Only touched at the last step (critical).
//   Tier 2  presence, the listening check-in, skip, vote, set list, ratings. Rate limited at "tight", off at "critical".
//   Tier 3  reactions and the emoji palette. These go first.
// "Off" never shows an error: the route answers with the last result it knew, or an empty one (lib/server/tierGate.ts).

export type Tier = 1 | 2 | 3
export type Level = 'normal' | 'tight' | 'critical'
export const LEVELS: Level[] = ['normal', 'tight', 'critical']
export const TIERS: Tier[] = [1, 2, 3]

export type Feature = 'signin' | 'me' | 'presence' | 'listen' | 'skip' | 'vote' | 'setlist' | 'rating' | 'reactions' | 'emojis'
export const TIER_OF: Record<Feature, Tier> = {
  signin: 1, me: 1,
  presence: 2, listen: 2, skip: 2, vote: 2, setlist: 2, rating: 2,
  reactions: 3, emojis: 3,
}

/** How the features read in the admin tables. */
export const FEATURE_LABEL: Record<Feature, string> = {
  signin: 'Sign-in', me: 'Your profile (/api/me)', presence: 'Tuned-in list', listen: 'Listening check-in', skip: 'Skip', vote: 'Hour vote',
  setlist: 'Set list votes', rating: 'Show ratings', reactions: 'Reactions', emojis: 'Emoji palette',
}

/** While a feature is at "tight", one person may use it at most once per this many milliseconds; in between they get the last answer. */
export const LIMITED_GAP_MS: Record<Feature, number> = {
  signin: 0, me: 30_000, presence: 120_000, listen: 120_000, skip: 20_000, vote: 20_000, setlist: 20_000, rating: 20_000, reactions: 5_000, emojis: 60_000,
}

/** The share of the monthly allowance (used, or projected for the month) at which a tier steps up. A value above 1 means "not by itself". */
export interface TierSetting { tight: number; critical: number }
export type Thresholds = Record<Tier, TierSetting>
export const DEFAULT_THRESHOLDS: Thresholds = {
  3: { tight: 0.5, critical: 0.7 },
  2: { tight: 0.75, critical: 0.9 },
  1: { tight: 9, critical: 0.97 },
}
/** An admin can pin a tier to a level whatever the meter says ('normal' keeps it fully on). */
export type Locks = Partial<Record<Tier, Level>>

/** The projection only counts once enough of the month has passed to mean something. */
export const MIN_PROJECTION_FRAC = 0.25

export interface Pressure { used: number; projected: number; elapsedFrac: number }
/** How full the month is: the larger of "used so far" and "on track to use" (as shares of the allowance). */
export function pressureOf(o: { usedHours: number; projectedHours: number; budgetHours: number; elapsedFrac: number }): number {
  if (!(o.budgetHours > 0)) return 0
  const used = o.usedHours / o.budgetHours
  const proj = o.elapsedFrac >= MIN_PROJECTION_FRAC ? o.projectedHours / o.budgetHours : 0
  return Math.max(used, proj)
}

export function levelFor(tier: Tier, pressure: number, th: Thresholds = DEFAULT_THRESHOLDS, lock?: Level): Level {
  if (lock) return lock
  const t = th[tier]
  return pressure >= t.critical ? 'critical' : pressure >= t.tight ? 'tight' : 'normal'
}

export interface TierStatus { tier: Tier; level: Level; locked: boolean; reason: string }
export function tierStatuses(pressure: number, th: Thresholds = DEFAULT_THRESHOLDS, locks: Locks = {}): Record<Tier, TierStatus> {
  const out = {} as Record<Tier, TierStatus>
  for (const tier of TIERS) {
    const lock = locks[tier]
    const level = levelFor(tier, pressure, th, lock)
    const pct = Math.round(pressure * 100)
    out[tier] = {
      tier, level, locked: !!lock,
      reason: lock ? `Set by an admin to ${level}.` : level === 'normal' ? '' : `The month is ${pct}% of the server-time allowance (used or on track).`,
    }
  }
  return out
}

export type Decision = 'go' | 'limited' | 'off'
export const decisionFor = (level: Level): Decision => (level === 'normal' ? 'go' : level === 'tight' ? 'limited' : 'off')

/** Reads thresholds from stored or posted data: each number is above 0 and at most 10 (above 1 turns that step off), and critical is never below tight. */
export function cleanThresholds(raw: unknown, base: Thresholds = DEFAULT_THRESHOLDS): Thresholds {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = {} as Thresholds
  for (const tier of TIERS) {
    const r = (d[String(tier)] && typeof d[String(tier)] === 'object' ? d[String(tier)] : {}) as Record<string, unknown>
    const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10 ? v : def)
    const tight = num(r.tight, base[tier].tight)
    let critical = num(r.critical, base[tier].critical)
    if (tight <= 1 && critical < tight) critical = tight // a tight value above 1 means "no tight stage" (tier 1), so critical stands alone
    out[tier] = { tight, critical }
  }
  return out
}

/** `{ "2": "critical" }` -> locks. Anything that is not a tier / level pair is dropped; 'auto', null or '' clears a lock. */
export function cleanLocks(raw: unknown): Locks {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Locks = {}
  for (const tier of TIERS) {
    const v = d[String(tier)]
    if (typeof v === 'string' && (LEVELS as string[]).includes(v)) out[tier] = v as Level
  }
  return out
}

// ── now playing: the backup way ──
// Normally every page asks our /api/nowplaying (edge cached). When the site is close to its server-time limit, pages can instead watch AzuraCast's
// own public now-playing feed (no function run) just to notice that the song, show or live status changed, and ask us only then (about 20 to 35
// runs an hour for the whole site instead of ~450). What listeners see still comes from us (word filter, show names, beat data, covers).
//   'auto'  default: switches itself on when the month's pressure reaches `directAt`
//   'off'   never    'on'  always (to test it, or to save time on purpose)
export type DirectMode = 'auto' | 'off' | 'on'
export const DIRECT_MODES: DirectMode[] = ['auto', 'off', 'on']
export const DEFAULT_DIRECT_AT = 0.75
export const cleanDirectMode = (v: unknown): DirectMode => ((DIRECT_MODES as unknown[]).includes(v) ? (v as DirectMode) : 'auto')
export const cleanDirectAt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0.1 && v <= 2 ? v : DEFAULT_DIRECT_AT)
export const directActive = (mode: DirectMode, pressure: number, at: number): boolean => mode === 'on' || (mode === 'auto' && pressure >= at)
