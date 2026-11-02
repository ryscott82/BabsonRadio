// TEMPORARY Firestore read meter (core, no imports so the tests can run it). It counts documents read per route per minute,
// in memory only: it never reads or writes Firestore itself. Billing rules it follows: every document returned is one read,
// a get() of a document that does not exist is one read, a query that returns nothing is one read, an aggregate (count) is one read.
// Remove with lib/server/readMeter.ts, app/api/admin/read-meter and the two call sites (admin.ts, http.ts) once the bill is under control.

export interface Cell { reads: number; requests: number; maxPerRequest: number }
export interface MinuteRow { minute: string; total: number; routes: Record<string, Cell> }

export interface MeterOptions {
  now?: () => number
  /** Which route this code is running for, and an object that is the same for every read inside one request (or null). */
  route: () => { name: string; key: object | null }
  log?: (line: string) => void
  instance?: string
  keepMinutes?: number
}

const MINUTE = 60_000
const iso = (m: number) => new Date(m * MINUTE).toISOString().slice(0, 16)

export function createMeter(o: MeterOptions) {
  const now = o.now ?? Date.now
  const keep = o.keepMinutes ?? 60
  const log = o.log ?? (() => {})
  const buckets = new Map<number, Map<string, Cell>>()
  const perRequest = new WeakMap<object, number>()
  let logged = Math.floor(now() / MINUTE) - 1

  const cell = (m: number, name: string): Cell => {
    let b = buckets.get(m)
    if (!b) { b = new Map(); buckets.set(m, b) }
    let c = b.get(name)
    if (!c) { c = { reads: 0, requests: 0, maxPerRequest: 0 }; b.set(name, c) }
    return c
  }

  const rows = (m: number): MinuteRow => {
    const b = buckets.get(m) ?? new Map<string, Cell>()
    const routes: Record<string, Cell> = {}
    let total = 0
    for (const [k, v] of [...b].sort((a, c) => c[1].reads - a[1].reads)) { routes[k] = { ...v }; total += v.reads }
    return { minute: iso(m), total, routes }
  }

  /** One log line per finished minute (only when something happened), so Vercel Logs hold the full history across instances. */
  const flush = (m: number) => {
    for (let x = logged + 1; x < m; x++) {
      const r = rows(x)
      if (buckets.has(x) && (r.total > 0 || Object.keys(r.routes).length)) {
        const compact = Object.fromEntries(Object.entries(r.routes).map(([k, v]) => [k, [v.reads, v.requests, v.maxPerRequest]]))
        log(`[firestore-reads] ${JSON.stringify({ m: r.minute, i: o.instance ?? '', total: r.total, routes: compact })}`)
      }
    }
    logged = Math.max(logged, m - 1)
    for (const k of buckets.keys()) if (k < m - keep) buckets.delete(k)
  }

  const add = (n: number) => {
    if (!(n > 0)) return
    const m = Math.floor(now() / MINUTE)
    flush(m)
    const { name, key } = o.route()
    const c = cell(m, name)
    c.reads += n
    if (key) { const r = (perRequest.get(key) ?? 0) + n; perRequest.set(key, r); if (r > c.maxPerRequest) c.maxPerRequest = r }
  }

  /** Call once per API request (from handle()). */
  const request = () => {
    const m = Math.floor(now() / MINUTE)
    flush(m)
    cell(m, o.route().name).requests++
  }

  const snapshot = (): MinuteRow[] => [...buckets.keys()].sort((a, b) => b - a).map(rows)

  return { add, request, snapshot }
}

export type Meter = ReturnType<typeof createMeter>

// ── what each read call costs ──

const isQuerySnap = (r: unknown): r is { size: number; docs: unknown[] } => !!r && typeof (r as { size?: unknown }).size === 'number' && Array.isArray((r as { docs?: unknown }).docs)
/** Reads billed for a result: documents returned (at least 1 for an empty query, 1 for one document or an aggregate). */
export const readsOf = (r: unknown): number => (Array.isArray(r) ? r.length : isQuerySnap(r) ? Math.max(1, r.size) : 1)

type Fn = (this: unknown, ...a: unknown[]) => unknown
/** Wrap a promise-returning method so its result is counted. Keeps `this`, arguments and the returned promise's value. */
export function wrapReads(proto: Record<string, unknown>, method: string, meter: Meter, count: (r: unknown) => number = readsOf) {
  const orig = proto[method] as Fn | undefined
  if (typeof orig !== 'function' || (orig as { __metered?: boolean }).__metered) return false
  const wrapped = function (this: unknown, ...a: unknown[]) {
    const p = orig.apply(this, a) as Promise<unknown>
    return p.then(r => { try { meter.add(count(r)) } catch { /* counting must never break a read */ } return r })
  }
  ;(wrapped as { __metered?: boolean }).__metered = true
  proto[method] = wrapped
  return true
}
