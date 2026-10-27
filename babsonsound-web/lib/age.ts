// Age maths shared by the About you step (/api/me/onboarding) and the birthday setup step (/api/me/setup). No server imports, so tests can run it.

/** Age in whole years on `now`, or null if y/m/d is not a real past date. */
export function ageOn(y: number, m: number, d: number, now = new Date()): number | null {
  if (![y, m, d].every(Number.isInteger) || y < 1900) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  if (dt.getTime() > now.getTime()) return null
  let age = now.getUTCFullYear() - y
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--
  return age
}

/**
 * The youngest and oldest the person can be, given a birthday that may have only a year.
 * With month and day both given the two are the same. With just a year the answer is a one-year range (they have or have not had
 * their birthday yet). Returns null for a year that is not real or is in the future.
 */
export function ageRangeFor(year: number, month?: number | null, day?: number | null, now = new Date()): { min: number; max: number } | null {
  if (!Number.isInteger(year) || year < 1900 || year > now.getUTCFullYear()) return null
  if (month != null || day != null) {
    if (month == null || day == null) return null // a day needs its month, and a month alone is not enough to be exact
    const a = ageOn(year, month, day, now)
    return a === null ? null : { min: a, max: a }
  }
  const max = now.getUTCFullYear() - year
  return { min: Math.max(0, max - 1), max }
}

export type AgeVerdict =
  | { kind: 'under13' }                 // definitely under 13: nothing is kept
  | { kind: 'ask-more' }                // the year sits on the 13 or 18 line: month and day are needed to know
  | { kind: 'minor' }                   // definitely 13 to 17: needs a parent or guardian OK
  | { kind: 'adult' }                   // definitely 18 or older
  | { kind: 'invalid' }

/** What to do with a birthday. A year alone is enough unless it falls on the 13 or 18 line. */
export function judgeAge(year: number, month?: number | null, day?: number | null, now = new Date()): AgeVerdict {
  const r = ageRangeFor(year, month, day, now)
  if (!r) return { kind: 'invalid' }
  if (r.max < 13) return { kind: 'under13' }
  if (r.min < 13 || (r.min < 18 && r.max >= 18)) return { kind: 'ask-more' }
  return r.max < 18 ? { kind: 'minor' } : { kind: 'adult' }
}
