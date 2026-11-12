import type { UsageStatus } from './usageBanner.ts'

// One shared copy of the month's server-time status for everything on an admin page that shows it (the top banner and the Today page's Needs you).
// The first one to ask reads /api/admin/server-usage/status; the rest get the same answer, so opening Today never makes a second call.
// The answer is kept for 5 minutes in memory and in sessionStorage (the server keeps it 5 minutes too). Nothing polls.

export const USAGE_CACHE = 'usageStatusCache'
export const USAGE_FRESH_MS = 5 * 60_000
type Store = Pick<Storage, 'getItem' | 'setItem'>

let memory: { at: number; v: UsageStatus } | null = null
let inflight: Promise<UsageStatus | null> | null = null

export const resetUsageStore = () => { memory = null; inflight = null }

function fromStorage(store: Store | null): { at: number; v: UsageStatus } | null {
  try { return store ? (JSON.parse(store.getItem(USAGE_CACHE) ?? 'null') as { at: number; v: UsageStatus } | null) : null } catch { return null }
}

/** Remember a status (also what the Server load page does when it has fresher numbers). */
export function saveUsage(v: UsageStatus, store: Store | null, now = Date.now()) {
  memory = { at: now, v }
  try { store?.setItem(USAGE_CACHE, JSON.stringify(memory)) } catch { /* private window */ }
}

/** The status, from memory, then storage, then one shared read. Null when it could not be read (a warning is a convenience: say nothing). */
export function loadUsage(fetcher: () => Promise<UsageStatus>, store: Store | null, now = Date.now()): Promise<UsageStatus | null> {
  const fresh = (c: { at: number; v: UsageStatus } | null) => (c && now - c.at < USAGE_FRESH_MS ? c.v : null)
  const hit = fresh(memory) ?? fresh(fromStorage(store))
  if (hit) return Promise.resolve(hit)
  if (!inflight) {
    inflight = fetcher().then(v => { saveUsage(v, store, now); return v }).catch(() => null).finally(() => { inflight = null })
  }
  return inflight
}
