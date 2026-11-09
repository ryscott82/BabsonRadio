// A short memory of verified sign-in tokens, so a listener who calls us every minute is not re-checked (a signature check plus
// certificate bookkeeping) on every call. Pure and generic so the tests can run it; lib/server/http.ts wires it to Firebase.
//
//  - An entry lives for at most `ttlMs` (5 minutes) and never past the token's own expiry (`exp`, in seconds).
//  - Keyed by the token text itself, so a different or altered token is simply a miss and gets the full check.
//  - Small: when it is full the oldest entries go. One server instance, nothing is shared or stored anywhere.
//  - forgetUid() drops every entry for a person, for the moment they are deleted or their access changes.

export const TOKEN_TTL_MS = 5 * 60_000
export const TOKEN_CACHE_MAX = 2_000

interface Entry<T> { value: T; until: number; uid: string }

export function createTokenCache<T extends { exp?: number; uid?: string }>(o: { ttlMs?: number; max?: number; now?: () => number } = {}) {
  const ttl = o.ttlMs ?? TOKEN_TTL_MS
  const max = o.max ?? TOKEN_CACHE_MAX
  const now = o.now ?? Date.now
  const map = new Map<string, Entry<T>>()
  const stats = { hits: 0, misses: 0 }

  function get(token: string): T | null {
    const e = map.get(token)
    if (!e) { stats.misses++; return null }
    if (now() >= e.until) { map.delete(token); stats.misses++; return null }
    stats.hits++
    return e.value
  }

  function set(token: string, value: T) {
    const at = now()
    const expiry = typeof value.exp === 'number' ? value.exp * 1000 : at + ttl
    const until = Math.min(at + ttl, expiry)
    if (until <= at) return // already expired: never keep it
    if (map.size >= max) {
      // Drop what has already lapsed first; if that is not enough, the oldest (Map keeps insertion order).
      for (const [k, v] of map) if (v.until <= at) map.delete(k)
      while (map.size >= max) { const k = map.keys().next().value; if (k === undefined) break; map.delete(k) }
    }
    map.delete(token) // re-insert at the end so "oldest" stays true
    map.set(token, { value, until, uid: String(value.uid ?? '') })
  }

  function forgetUid(uid: string) {
    for (const [k, v] of map) if (v.uid === uid) map.delete(k)
  }

  return { get, set, forgetUid, clear: () => map.clear(), size: () => map.size, stats: () => ({ ...stats }) }
}

export type TokenCache<T extends { exp?: number; uid?: string }> = ReturnType<typeof createTokenCache<T>>
