// Limits that keep contact matching from working as a reverse phone lookup. Plain functions so the tests can run them.
//
//  - one full sync a day per route
//  - a cap on NEW distinct numbers per rolling 30 days (a re-sync of the same contacts costs nothing against the cap)
//  - anything that looks like a scrape is flagged and pauses that account until an admin clears it
//
// The "already submitted" list is one string on the member's contactSyncs doc: 16 hex characters (8 bytes of an HMAC of the
// hash, never the hash itself) followed by 4 base-36 characters for the day it was first sent. 20 characters per number.

export const DAY_MS = 86_400_000
export const MIN_GAP_MS = 23 * 3_600_000      // one full sync a day (a little slack for clocks and time zones)
export const WINDOW_DAYS = 30
export const NEW_HASH_CAP = 5000              // new distinct numbers per rolling 30 days
export const MAX_PER_REQUEST = 5000

/** Flag a sync as a possible scrape: lots of matches, or most of a large list matching. */
export const FLAG_MATCHED = 500
export const FLAG_RATIO = 0.7
export const FLAG_RATIO_MIN_SENT = 300

const REC = 20

const dayCode = (day: number) => day.toString(36).padStart(4, '0')

export type Seen = Map<string, number> // id (16 hex) → day first sent

export function parseSeen(s: unknown): Seen {
  const out: Seen = new Map()
  if (typeof s !== 'string') return out
  for (let i = 0; i + REC <= s.length; i += REC) out.set(s.slice(i, i + 16), parseInt(s.slice(i + 16, i + REC), 36))
  return out
}

export function serializeSeen(m: Seen): string {
  let s = ''
  for (const [id, day] of m) s += id + dayCode(day)
  return s
}

/**
 * Takes the ids a sync wants to submit. Entries older than 30 days are dropped first. Numbers already in the list are free; new ones
 * are accepted until the cap, and the rest are ignored (not looked up, not stored). Returns the new list and which ids to look up.
 */
export function chargeSync(prev: Seen, ids: string[], now: number): { seen: Seen; accepted: Set<string>; added: number; capped: boolean } {
  const today = Math.floor(now / DAY_MS)
  const seen: Seen = new Map([...prev].filter(([, d]) => today - d < WINDOW_DAYS))
  const accepted = new Set<string>()
  let added = 0, capped = false
  for (const id of ids) {
    if (seen.has(id)) { accepted.add(id); continue }
    if (seen.size >= NEW_HASH_CAP) { capped = true; continue }
    seen.set(id, today)
    accepted.add(id)
    added++
  }
  return { seen, accepted, added, capped }
}

/** Why a finished sync looks like a scrape, or null. */
export function anomaly(i: { sent: number; matched: number }): string | null {
  if (i.matched >= FLAG_MATCHED) return `${i.matched} matches in one sync`
  if (i.sent >= FLAG_RATIO_MIN_SENT && i.matched / i.sent >= FLAG_RATIO) return `${i.matched} of ${i.sent} numbers matched`
  return null
}

export const gapOk = (lastMs: number, now: number) => now - lastMs >= MIN_GAP_MS
