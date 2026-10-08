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
  /** Nothing is scheduled in this window; AzuraCast's default playlist plays (e.g. overnight). */
  quiet?: boolean
  /** Longest single block in this window (e.g. 120 for two-hour night blocks). Default: the global maximum. */
  blockMinutes?: number
  /** One genre for the whole window each day (e.g. a whole evening of lofi), changing from day to day. */
  oneGenre?: boolean
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
  /** Favor genres listeners like (listener counts, ratings, reactions). Every genre still gets airtime. */
  learn: boolean
  rules: AutoRule[]
}

export interface Interval { startMs: number; endMs: number }
export interface WeeklyEntry { dow: number; startMin: number; endMin: number; rep?: Repeat }
export interface PlannedBlock { startMs: number; endMs: number; label: string; ruleId: string }

export const DEFAULT_CONFIG: AutoConfig = {
  enabled: true,
  timezone: 'America/New_York',
  horizonHours: 48,
  stepMinutes: 30,
  maxBlockMinutes: 60,
  lockMinutes: 60,
  syncToAzuraCast: false,
  learn: true,
  playlistMap: {},
  defaultFillers: ['Indie & Alt', 'Throwback Hits', 'Pop Hits', 'Hip-Hop & R&B'],
  rules: [
    // Nothing scheduled overnight: AzuraCast's default autoDJ playlist plays.
    { id: 'overnight', name: 'Overnight (default playlist)', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '07:00',
      fillers: [], priority: 10, quiet: true },
    { id: 'weekday-morning', name: 'Weekday mornings', days: [1, 2, 3, 4, 5], start: '07:00', end: '10:00',
      fillers: ['Acoustic Morning', 'Indie Folk'], priority: 10 },
    { id: 'weeknight', name: 'Weeknights', days: [0, 1, 2, 3, 4], start: '21:00', end: '24:00',
      fillers: ['Lofi Beats', 'Chill Jazz', 'Acoustic'], priority: 20, blockMinutes: 120, oneGenre: true },
    { id: 'weekend-night', name: 'Weekend nights', days: [5, 6], start: '21:00', end: '24:00',
      fillers: ['Dance Mix', 'Throwback Hits'], priority: 20, blockMinutes: 120, oneGenre: true },
  ],
}

// ── Time helpers ────────────────────────────────────────────────

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function localParts(ms: number, timeZone: string): { dow: number; minutes: number; y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return {
    dow: DOW.indexOf(get('weekday')), minutes: Number(get('hour')) * 60 + Number(get('minute')),
    y: Number(get('year')), m: Number(get('month')), d: Number(get('day')),
  }
}

/** How a recurring show repeats. Default is every week on `dayOfWeek`. */
export interface Repeat {
  repeat?: 'weekly' | 'biweekly' | 'monthly' | 'dates'
  anchor?: string      // biweekly: "YYYY-MM-DD" of any day the show airs; every other week from there
  weeks?: number[]     // monthly: which occurrence of the weekday, 1-4, or 5 = the last one
  dates?: string[]     // dates: exact "YYYY-MM-DD" days (one-offs and irregular shows)
}

const ymdStr = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Does a show with this repeat rule air on the station-local day y-m-d (which falls on weekday `dow`)? */
export function occursOn(r: Repeat & { dayOfWeek?: number }, dow: number, y: number, m: number, d: number): boolean {
  const mode = r.repeat ?? 'weekly'
  if (mode === 'dates') return (r.dates ?? []).includes(ymdStr(y, m, d))
  if (r.dayOfWeek !== undefined && r.dayOfWeek !== dow) return false
  if (mode === 'biweekly' && r.anchor && /^\d{4}-\d{2}-\d{2}$/.test(r.anchor)) {
    const [ay, am, ad] = r.anchor.split('-').map(Number)
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
    return Math.floor(days / 7) % 2 === 0
  }
  if (mode === 'monthly') {
    const nth = Math.ceil(d / 7)
    const last = d + 7 > new Date(Date.UTC(y, m, 0)).getUTCDate()
    return (r.weeks ?? []).some(w => w === nth || (w === 5 && last))
  }
  return true
}

/** Clean repeat settings from untrusted input (admin form). */
export function cleanRepeat(b: Record<string, unknown>): Required<Pick<Repeat, 'repeat'>> & Repeat {
  const mode = ['weekly', 'biweekly', 'monthly', 'dates'].includes(String(b.repeat)) ? (b.repeat as NonNullable<Repeat['repeat']>) : 'weekly'
  const isDate = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
  return {
    repeat: mode,
    anchor: mode === 'biweekly' && isDate(b.anchor) ? String(b.anchor) : '',
    weeks: mode === 'monthly' ? [...new Set((Array.isArray(b.weeks) ? b.weeks : []).map(Number).filter(n => n >= 1 && n <= 5))] : [],
    dates: mode === 'dates' ? [...new Set((Array.isArray(b.dates) ? b.dates : []).filter(isDate).map(String))].sort().slice(0, 60) : [],
  }
}

/** "HH:MM" (24h) or "h:mm AM/PM" → minutes since midnight, or null. "24:00" → 1440. */
/** End minute-of-day for a show: an end at or before the start means it runs past midnight (next day). */
export function endAfter(start: number, end: number): number { return end > start ? end : end + 1440 }

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

/** The parts of `a` not covered by any interval in `busy` (pieces shorter than `minMs` are dropped). */
export function clipInterval(a: Interval, busy: Interval[], minMs = 5 * 60_000): Interval[] {
  let pieces: Interval[] = [{ ...a }]
  for (const b of busy) {
    const next: Interval[] = []
    for (const p of pieces) {
      if (b.endMs <= p.startMs || b.startMs >= p.endMs) { next.push(p); continue }
      if (b.startMs > p.startMs) next.push({ startMs: p.startMs, endMs: b.startMs })
      if (b.endMs < p.endMs) next.push({ startMs: b.endMs, endMs: p.endMs })
    }
    pieces = next
  }
  return pieces.filter(p => p.endMs - p.startMs >= minMs)
}

/** Pick the night's genre. Without learned weights this rotates; with them, liked genres come up more often (never below 40% of average). */
function pickGenre(pool: string[], dayKey: number, ruleId: string, W: Record<string, number>, exclude = -1): number {
  const seed = dayKey + ruleId.length * 3
  if (!Object.keys(W).length) {
    const idx = ((seed % pool.length) + pool.length) % pool.length
    return idx === exclude ? (idx + 1) % pool.length : idx
  }
  const w = pool.map((f, i) => (i === exclude ? 0 : Math.max(0.4, W[f.toLowerCase()] ?? 1)))
  const total = w.reduce((a, b) => a + b, 0)
  let r = (hash(seed * 7919 + ruleId.length) / 4294967296) * total
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i }
  return 0
}

export function planAutoBlocks(opts: {
  cfg: AutoConfig
  fromMs: number            // plan from here (already rounded/locked by the caller)
  untilMs: number
  busy: Interval[]          // approved air slots + kept blocks
  weekly: WeeklyEntry[]     // recurring weekly shows, evaluated in station time
  lastLabel?: string        // filler of the block just before fromMs, to avoid repeating it
  weights?: Record<string, number> // learned taste per genre (lowercase name → 1 = average); empty = no preference
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
      const on = (q: { dow: number; y: number; m: number; d: number }) => occursOn({ ...w.rep, dayOfWeek: w.rep?.repeat === 'dates' ? undefined : w.dow }, q.dow, q.y, q.m, q.d)
      if (on(p) && p.minutes < w.endMin && p.minutes + cfg.stepMinutes > w.startMin) return true
      // a show that started yesterday and runs past midnight
      return w.endMin > 1440 && p.minutes < w.endMin - 1440 && on(localParts(a - 86_400_000, cfg.timezone))
    })

  // 1–4: tag free slices by rule and merge neighbours
  type Raw = { startMs: number; endMs: number; ruleId: string; pool: string[]; oneGenre?: boolean; dayKey?: number }
  const raw: Raw[] = []
  for (let t = first; t + step <= opts.untilMs; t += step) {
    if (taken(t, t + step)) continue
    const p = localParts(t, cfg.timezone)
    const rule = cfg.rules
      .filter(r => ruleMatches(r, p.dow, p.minutes))
      .sort((a, b) => b.priority - a.priority)[0]
    if (rule?.quiet) continue // nothing scheduled here: the default playlist plays
    const ruleId = rule?.id ?? 'default'
    const pool = (rule?.fillers.length ? rule.fillers : cfg.defaultFillers)
    const last = raw[raw.length - 1]
    // Longest block here: the rule's own length (e.g. 2h at night) or the global maximum.
    const blockMs = rule?.oneGenre ? 24 * 3600_000 : rule?.blockMinutes ? rule.blockMinutes * 60_000 : maxBlock
    const ruleStart = rule ? parseClock(rule.start) : null
    // With its own length, a rule's blocks line up from where the rule starts; otherwise on the hour.
    const onBoundary = rule?.oneGenre && ruleStart !== null
      ? p.minutes === ruleStart
      : rule?.blockMinutes && ruleStart !== null
      ? ((p.minutes - ruleStart + 1440) % 1440) % rule.blockMinutes === 0
      : p.minutes % align === 0
    if (last && !onBoundary && last.endMs === t && last.ruleId === ruleId && t + step - last.startMs <= blockMs) last.endMs = t + step
    else {
      // The day this window began (a window running past midnight still belongs to the evening it started).
      const startedYesterday = ruleStart !== null && p.minutes < ruleStart
      raw.push({ startMs: t, endMs: t + step, ruleId, pool, oneGenre: rule?.oneGenre,
        dayKey: Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000) - (startedYesterday ? 1 : 0) })
    }
  }

  // 5: choose fillers — least recently used first, never the same as the block before it
  const lastUsed = new Map<string, number>()
  const W = opts.weights ?? {}
  let prev = opts.lastLabel
  return raw.map((b, i) => {
    if (b.oneGenre && b.dayKey !== undefined && b.pool.length) {
      // Same genre all window long (also after a show interrupts it); a different one tomorrow.
      const idx = pickGenre(b.pool, b.dayKey, b.ruleId, W)
      const prevIdx = b.pool.length > 1 ? pickGenre(b.pool, b.dayKey - 1, b.ruleId, W) : -1
      // Never the same genre two nights running, unless it is the only one.
      const use = idx === prevIdx ? pickGenre(b.pool, b.dayKey, b.ruleId, W, idx) : idx
      prev = b.pool[use]
      return { startMs: b.startMs, endMs: b.endMs, label: b.pool[use], ruleId: b.ruleId }
    }
    const options = b.pool.length > 1 ? b.pool.filter(f => f !== prev) : b.pool
    // Favor what listeners like, but still rotate: the longer ago a genre played, the more it counts.
    const score = (f: string) => {
      const gap = lastUsed.has(f) ? Math.min(i - (lastUsed.get(f) ?? 0), 4) : 4
      return (W[f.toLowerCase()] ?? 1) * (0.4 + gap * 0.15) + (hash(b.startMs / step + f.length) % 1000) / 1e6
    }
    const ranked = [...options].sort((x, y) => score(y) - score(x))
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
    const quiet = x.quiet === true
    if (parseClock(start) === null || parseClock(end) === null || !days.length || (!fillers.length && !quiet)) return []
    return [{
      id: text(x.id, 40).replace(/[^a-z0-9-]/gi, '') || `rule-${i + 1}`,
      name: text(x.name, 60) || `Rule ${i + 1}`,
      days: [...new Set(days)].sort(), start, end, fillers,
      priority: clamp(x.priority, 0, 100, 10),
      ...(quiet ? { quiet: true } : {}),
      ...(!quiet && x.oneGenre === true ? { oneGenre: true } : {}),
      ...(!quiet && Number(x.blockMinutes) > 0 ? { blockMinutes: clamp(x.blockMinutes, 30, 720, 60) } : {}),
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
    learn: o.learn !== false,
    playlistMap: Object.fromEntries(Object.entries((o.playlistMap ?? {}) as Record<string, unknown>).slice(0, 60)
      .map(([k, v]) => [text(k, 40), text(v, 80)]).filter(([k, v]) => k && v)),
    defaultFillers: list(o.defaultFillers).length ? list(o.defaultFillers) : d.defaultFillers,
    rules,
  }
}
