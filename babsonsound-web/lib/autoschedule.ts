// Auto-scheduler core. Pure functions only (no database), so it is easy to test and reason about.
//
// What it does: given the real bookings (approved air slots + the weekly show grid), it fills every
// remaining gap in the next N hours with "filler" programming (lofi beats, chill jazz, acoustic...)
// chosen by time-of-day rules the staff edit on /admin/autoschedule.
//
// Steps: 1) walk the horizon in `stepMinutes` slices  2) skip slices that overlap a real booking
// 3) tag each slice with the highest-priority rule matching its local day and time (else the default)
// 4) merge neighbouring slices with the same rule into blocks (max `maxBlockMinutes`)
// 5) pick each block's filler: least recently used in this plan, never the same as the previous block.

export interface AutoRule {
  id: string
  name: string
  days: number[]      // 0 = Sunday ... 6 = Saturday; the day the block STARTS (a 22:00–06:00 rule on Mon runs into Tue)
  start: string       // "HH:MM" local station time
  end: string         // "HH:MM" or "24:00"; if end <= start the rule runs past midnight
  fillers: string[]   // what can play, e.g. ["Lofi beats", "Chill jazz"]
  priority: number    // higher wins when rules overlap
}

export interface AutoConfig {
  enabled: boolean
  timezone: string          // IANA, e.g. "America/New_York"
  horizonHours: number      // how far ahead to fill (default 48)
  stepMinutes: number       // planning grid (default 30)
  maxBlockMinutes: number   // longest single filler block (default 120)
  lockMinutes: number       // blocks starting sooner than this are left alone on rebuild
  defaultFillers: string[]  // used when no rule matches
  syncToAzuraCast: boolean  // push the plan to AzuraCast playlists after every rebuild
  playlistMap: Record<string, string> // filler name -> AzuraCast playlist name (optional; default is the same name)
  rules: AutoRule[]
}

export interface Interval { startMs: number; endMs: number }
export interface WeeklyEntry { dow: number; startMin: number; endMin: number }
export interface PlannedBlock { startMs: number; endMs: number; label: string; ruleId: string }

export const DEFAULT_CONFIG: AutoConfig = {
  enabled: true,
  timezone: 'America/New_York',
  horizonHours: 48,
  stepMinutes: 30,
  maxBlockMinutes: 60,
  lockMinutes: 60,
  syncToAzuraCast: false,
  playlistMap: {},
  defaultFillers: ['Indie & Alt', 'Throwback Hits', 'Pop Hits', 'Hip-Hop & R&B'],
  rules: [
    { id: 'overnight', name: 'Overnight', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '07:00',
      fillers: ['Ambient & Sleep', 'Chill Jazz'], priority: 10 },
    { id: 'weekday-morning', name: 'Weekday mornings', days: [1, 2, 3, 4, 5], start: '07:00', end: '10:00',
      fillers: ['Acoustic Morning', 'Indie Folk'], priority: 10 },
    { id: 'weeknight', name: 'Weeknights', days: [0, 1, 2, 3, 4], start: '21:00', end: '24:00',
      fillers: ['Lofi Beats', 'Chill Jazz', 'Acoustic'], priority: 20 },
    { id: 'weekend-night', name: 'Weekend nights', days: [5, 6], start: '21:00', end: '24:00',
      fillers: ['Dance Mix', 'Throwback Hits'], priority: 20 },
  ],
}

// ── Time helpers ────────────────────────────────────────────────

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function localParts(ms: number, timeZone: string): { dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return { dow: DOW.indexOf(get('weekday')), minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

/** "HH:MM" (24h) or "h:mm AM/PM" → minutes since midnight, or null. "24:00" → 1440. */
export function parseClock(s: string): number | null {
  const t = String(s ?? '').trim()
  let m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (m) { const v = Number(m[1]) * 60 + Number(m[2]); return v <= 1440 && Number(m[2]) < 60 ? v : null }
  m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t)
  if (m) {
    let h = Number(m[1]) % 12
    if (m[3].toUpperCase() === 'PM') h += 12
    return Number(m[2]) < 60 && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? h * 60 + Number(m[2]) : null
  }
  return null
}

function ruleMatches(r: AutoRule, dow: number, minutes: number): boolean {
  const s = parseClock(r.start), e = parseClock(r.end)
  if (s === null || e === null) return false
  if (e > s) return r.days.includes(dow) && minutes >= s && minutes < e
  // wraps midnight
  if (minutes >= s) return r.days.includes(dow)
  if (minutes < e) return r.days.includes((dow + 6) % 7)
  return false
}

function hash(n: number): number {
  let x = Math.floor(n) | 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return (x ^ (x >>> 16)) >>> 0
}

// ── The planner ─────────────────────────────────────────────────

export function planAutoBlocks(opts: {
  cfg: AutoConfig
  fromMs: number            // plan from here (already rounded/locked by the caller)
  untilMs: number
  busy: Interval[]          // approved air slots + kept blocks
  weekly: WeeklyEntry[]     // recurring weekly shows, evaluated in station time
  lastLabel?: string        // filler of the block just before fromMs, to avoid repeating it
}): PlannedBlock[] {
  const { cfg, busy, weekly } = opts
  const step = cfg.stepMinutes * 60_000
  const maxBlock = cfg.maxBlockMinutes * 60_000
  const first = Math.ceil(opts.fromMs / step) * step
  const align = cfg.maxBlockMinutes // blocks start on multiples of this (60 = on the hour)

  const taken = (a: number, b: number) =>
    busy.some(x => x.startMs < b && x.endMs > a) ||
    weekly.some(w => {
      // evaluate against the station-local day of this slice
      const p = localParts(a, cfg.timezone)
      return p.dow === w.dow && p.minutes < w.endMin && p.minutes + cfg.stepMinutes > w.startMin
    })

  // 1–4: tag free slices by rule and merge neighbours
  type Raw = { startMs: number; endMs: number; ruleId: string; pool: string[] }
  const raw: Raw[] = []
  for (let t = first; t + step <= opts.untilMs; t += step) {
    if (taken(t, t + step)) continue
    const p = localParts(t, cfg.timezone)
    const rule = cfg.rules
      .filter(r => ruleMatches(r, p.dow, p.minutes))
      .sort((a, b) => b.priority - a.priority)[0]
    const ruleId = rule?.id ?? 'default'
    const pool = (rule?.fillers.length ? rule.fillers : cfg.defaultFillers)
    const last = raw[raw.length - 1]
    const onBoundary = p.minutes % align === 0 // start a fresh block on the hour (or every maxBlock)
    if (last && !onBoundary && last.endMs === t && last.ruleId === ruleId && t + step - last.startMs <= maxBlock) last.endMs = t + step
    else raw.push({ startMs: t, endMs: t + step, ruleId, pool })
  }

  // 5: choose fillers — least recently used first, never the same as the block before it
  const lastUsed = new Map<string, number>()
  let prev = opts.lastLabel
  return raw.map((b, i) => {
    const options = b.pool.length > 1 ? b.pool.filter(f => f !== prev) : b.pool
    const ranked = [...options].sort((x, y) =>
      (lastUsed.get(x) ?? -1) - (lastUsed.get(y) ?? -1) ||
      hash(b.startMs / step + x.length) - hash(b.startMs / step + y.length))
    const label = ranked[0] ?? 'Indie & Alt'
    lastUsed.set(label, i)
    prev = label
    return { startMs: b.startMs, endMs: b.endMs, label, ruleId: b.ruleId }
  })
}

// ── Validation (used when staff save settings) ──────────────────

export function sanitizeConfig(input: unknown): AutoConfig {
  const o = (input ?? {}) as Record<string, unknown>
  const d = DEFAULT_CONFIG
  const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt
  }
  const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
  // "Auto DJ" is never shown to listeners, so it is dropped from any saved lists.
  const list = (v: unknown) => (Array.isArray(v) ? v : []).map(x => text(x, 40)).filter(x => x && !/auto\s*-?dj/i.test(x)).slice(0, 12)

  let timezone = text(o.timezone, 60) || d.timezone
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }) } catch { timezone = d.timezone }

  const rules: AutoRule[] = (Array.isArray(o.rules) ? o.rules : []).slice(0, 30).flatMap((r, i) => {
    const x = (r ?? {}) as Record<string, unknown>
    const start = text(x.start, 5), end = text(x.end, 5)
    const days = (Array.isArray(x.days) ? x.days : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
    const fillers = list(x.fillers)
    if (parseClock(start) === null || parseClock(end) === null || !days.length || !fillers.length) return []
    return [{
      id: text(x.id, 40).replace(/[^a-z0-9-]/gi, '') || `rule-${i + 1}`,
      name: text(x.name, 60) || `Rule ${i + 1}`,
      days: [...new Set(days)].sort(), start, end, fillers,
      priority: clamp(x.priority, 0, 100, 10),
    }]
  })

  return {
    enabled: o.enabled !== false,
    timezone,
    horizonHours: clamp(o.horizonHours, 6, 168, d.horizonHours),
    stepMinutes: [15, 30, 60].includes(Number(o.stepMinutes)) ? Number(o.stepMinutes) : d.stepMinutes,
    maxBlockMinutes: clamp(o.maxBlockMinutes, 30, 360, d.maxBlockMinutes),
    lockMinutes: clamp(o.lockMinutes, 0, 360, d.lockMinutes),
    syncToAzuraCast: o.syncToAzuraCast === true,
    playlistMap: Object.fromEntries(Object.entries((o.playlistMap ?? {}) as Record<string, unknown>).slice(0, 60)
      .map(([k, v]) => [text(k, 40), text(v, 80)]).filter(([k, v]) => k && v)),
    defaultFillers: list(o.defaultFillers).length ? list(o.defaultFillers) : d.defaultFillers,
    rules,
  }
}
