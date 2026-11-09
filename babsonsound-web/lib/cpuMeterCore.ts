// Per-route server time (CPU) meter, core. No imports, so the tests can run it. Sits next to the Firestore read meter
// (lib/readMeterCore.ts): one log line per minute per instance ("[cpu-meter] {...}" in Vercel Logs) and a snapshot for the admin page.
// It adds no Firestore reads or writes. Turn off with CPU_METER=0.
//
// How the time is split: the process's CPU counter is read every time a request starts or finishes, and the CPU used since the
// last reading is shared equally among the requests running at that moment (a request waiting on Firestore is "running" too).
// So the per-minute total is exact, and the split between routes is an estimate that is good when requests are short and gets
// blurrier when many overlap. CPU used while no request is running (timers, background work) is kept as "idle".

export interface CpuCell { requests: number; cpuMs: number; wallMs: number; maxCpuMs: number }
export interface CpuMinute { minute: string; totalCpuMs: number; idleCpuMs: number; routes: Record<string, CpuCell> }

export interface CpuMeterOptions {
  now?: () => number
  /** Total CPU time of this process so far, in milliseconds. */
  cpu: () => number
  log?: (line: string) => void
  instance?: string
  keepMinutes?: number
}

const MINUTE = 60_000
const iso = (m: number) => new Date(m * MINUTE).toISOString().slice(0, 16)
interface Slot { name: string; t0: number; cpu: number }
interface Bucket { idle: number; cells: Map<string, CpuCell> }

export function createCpuMeter(o: CpuMeterOptions) {
  const now = o.now ?? Date.now
  const keep = o.keepMinutes ?? 60
  const log = o.log ?? (() => {})
  const buckets = new Map<number, Bucket>()
  const active = new Set<Slot>()
  let lastCpu = o.cpu()
  let logged = Math.floor(now() / MINUTE) - 1

  const bucket = (m: number): Bucket => {
    let b = buckets.get(m)
    if (!b) { b = { idle: 0, cells: new Map() }; buckets.set(m, b) }
    return b
  }
  const cell = (m: number, name: string): CpuCell => {
    const b = bucket(m)
    let c = b.cells.get(name)
    if (!c) { c = { requests: 0, cpuMs: 0, wallMs: 0, maxCpuMs: 0 }; b.cells.set(name, c) }
    return c
  }

  const row = (m: number): CpuMinute => {
    const b = buckets.get(m)
    const routes: Record<string, CpuCell> = {}
    let total = 0
    for (const [k, v] of [...(b?.cells ?? [])].sort((a, c) => c[1].cpuMs - a[1].cpuMs)) { routes[k] = { ...v }; total += v.cpuMs }
    return { minute: iso(m), totalCpuMs: round(total + (b?.idle ?? 0)), idleCpuMs: round(b?.idle ?? 0), routes: roundRoutes(routes) }
  }

  const flush = (m: number) => {
    for (let x = logged + 1; x < m; x++) {
      const b = buckets.get(x)
      if (!b) continue
      const r = row(x)
      const compact = Object.fromEntries(Object.entries(r.routes).map(([k, v]) => [k, [v.requests, v.cpuMs, v.wallMs, v.maxCpuMs]]))
      log(`[cpu-meter] ${JSON.stringify({ m: r.minute, i: o.instance ?? '', cpuMs: r.totalCpuMs, idleMs: r.idleCpuMs, routes: compact })}`)
    }
    logged = Math.max(logged, m - 1)
    for (const k of buckets.keys()) if (k < m - keep) buckets.delete(k)
  }

  /** Hand the CPU used since the last reading to whoever was running (or to "idle"). */
  const settle = () => {
    const c = o.cpu()
    const d = Math.max(0, c - lastCpu)
    lastCpu = c
    if (d <= 0) return
    flush(Math.floor(now() / MINUTE))
    if (active.size === 0) { bucket(Math.floor(now() / MINUTE)).idle += d; return }
    const share = d / active.size
    for (const s of active) s.cpu += share
  }

  /** Call when a request starts; call the returned function when it ends. */
  const start = (name: string): (() => void) => {
    settle()
    const slot: Slot = { name, t0: now(), cpu: 0 }
    active.add(slot)
    let done = false
    return () => {
      if (done) return
      done = true
      settle()
      active.delete(slot)
      const t = now()
      const m = Math.floor(t / MINUTE)
      flush(m)
      const c = cell(m, slot.name)
      c.requests++
      c.cpuMs += slot.cpu
      c.wallMs += Math.max(0, t - slot.t0)
      if (slot.cpu > c.maxCpuMs) c.maxCpuMs = slot.cpu
    }
  }

  /** Wrap one request. The route name is looked up when it starts. */
  async function track<T>(name: () => string, fn: () => Promise<T>): Promise<T> {
    const end = start(name())
    try { return await fn() } finally { end() }
  }

  const snapshot = (): CpuMinute[] => [...buckets.keys()].sort((a, b) => b - a).map(row)
  return { start, track, snapshot }
}

export type CpuMeter = ReturnType<typeof createCpuMeter>

const round = (n: number) => Math.round(n * 10) / 10
function roundRoutes(r: Record<string, CpuCell>): Record<string, CpuCell> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { requests: v.requests, cpuMs: round(v.cpuMs), wallMs: round(v.wallMs), maxCpuMs: round(v.maxCpuMs) }]))
}

/** Add the minutes up into one row per route: requests, total and average CPU, total reads when a reads table is given. */
export interface RouteTotal { route: string; requests: number; cpuMs: number; avgCpuMs: number; wallMs: number; maxCpuMs: number; reads: number }
export function totalsOf(minutes: CpuMinute[], reads: Record<string, { reads: number }> = {}): RouteTotal[] {
  const t = new Map<string, RouteTotal>()
  for (const m of minutes) for (const [k, v] of Object.entries(m.routes)) {
    const r = t.get(k) ?? { route: k, requests: 0, cpuMs: 0, avgCpuMs: 0, wallMs: 0, maxCpuMs: 0, reads: reads[k]?.reads ?? 0 }
    r.requests += v.requests; r.cpuMs += v.cpuMs; r.wallMs += v.wallMs; r.maxCpuMs = Math.max(r.maxCpuMs, v.maxCpuMs)
    t.set(k, r)
  }
  return [...t.values()].map(r => ({ ...r, cpuMs: round(r.cpuMs), wallMs: round(r.wallMs), avgCpuMs: r.requests ? round(r.cpuMs / r.requests) : 0 })).sort((a, b) => b.cpuMs - a.cpuMs)
}
