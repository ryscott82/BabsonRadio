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
  /** `false` switches this rule off without deleting it. Missing means on. */
  enabled?: boolean
}

/** One genre playlist the Auto DJ can schedule. `enabled: false` = temporarily excluded: kept with its times, but not scheduled. */
export interface AutoPlaylist { name: string; enabled?: boolean }

export interface AutoConfig {
  enabled: boolean
  /** The playlists the Auto DJ may use (the names match AzuraCast playlists, or the playlist map). Add, remove or exclude them on the Auto DJ page. */
  playlists: AutoPlaylist[]
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
  /** Night-time color-changing background (album colors) while the auto DJ is on air. */
  colorChanging: boolean
  /** The album-color background also comes on by itself on weekend nights (unless a host picked the standard look). Default on. */
  colorWeekendNights: boolean
  /** Manual frequency per playlist (lowercase name → multiplier, 1 = average, 0 = avoid). A playlist not listed here uses the learned value. */
  weightOverrides: Record<string, number>
  rules: AutoRule[]
  /** Each playlist's share of each part of the week, 0 to 1; the shares of all playlists in a part add up to 1. Key = lowercase playlist name. This is what normally fills the schedule. */
  mix: Record<string, Partial<Record<Part, number>>>
  /** Hours set by hand ("dow-hour" → playlist name, or QUIET for nothing scheduled). These always win over the mix. Rarely needed. */
  grid: Record<string, string>
}

export interface Interval { startMs: number; endMs: number }
export interface WeeklyEntry { dow: number; startMin: number; endMin: number; rep?: Repeat }
export interface PlannedBlock { startMs: number; endMs: number; label: string; ruleId: string }

export const DEFAULT_CONFIG: AutoConfig = {
  enabled: true,
  playlists: [{ name: 'Jazz House for Studying' }, { name: 'Pop Hits' }],
  timezone: 'America/New_York',
  horizonHours: 48,
  stepMinutes: 30,
  maxBlockMinutes: 60,
  lockMinutes: 60,
  syncToAzuraCast: false,
  learn: true,
  colorChanging: false,
  colorWeekendNights: true,
  playlistMap: {},
  weightOverrides: {},
  defaultFillers: ['Pop Hits', 'Jazz House for Studying'],
  // Normally nobody edits a schedule: the mix below decides, and `learn` leans toward what listeners enjoy. Rules are only for old custom blocks.
  rules: [],
  mix: {
    'jazz house for studying': { morning: 0.75, afternoon: 0.5, evening: 0.4, weekdayNight: 0.8, weekendNight: 0.2 },
    'pop hits': { morning: 0.25, afternoon: 0.5, evening: 0.6, weekdayNight: 0.2, weekendNight: 0.8 },
  },
  grid: {},
}

// ── Playlists the Auto DJ may use ───────────────────────────────

const plKey = (s: string) => s.trim().toLowerCase()

/** The playlists that are on (not temporarily excluded), under their saved names. */
export const activePlaylists = (cfg: Pick<AutoConfig, 'playlists'>): string[] => (cfg.playlists ?? []).filter(p => p.enabled !== false).map(p => p.name)

/**
 * What a block can play: the block's own playlists that are on, or every playlist that is on when none of them is (the others fill in for an
 * excluded or removed playlist). A config without a playlist list (older callers) uses the names as given.
 */
export function poolOf(fillers: string[], cfg: Pick<AutoConfig, 'playlists'>): string[] {
  if (!cfg.playlists) return [...new Set(fillers)]
  const active = activePlaylists(cfg)
  const hit = [...new Set(fillers.flatMap(f => active.filter(a => plKey(a) === plKey(f))))]
  return hit.length ? hit : active
}

// ── The five parts of the week ──────────────────────────────────

/** Mornings 5a–12p, afternoons 12–5p, evenings 5–9p, then the night: Sun–Wed nights are weeknights, Thu, Fri and Sat nights are weekend nights (Thursday is a party night at Babson) (a night belongs to the day it starts). */
export type Part = 'morning' | 'afternoon' | 'evening' | 'weekdayNight' | 'weekendNight'
export const PARTS: { id: Part; label: string; when: string }[] = [
  { id: 'morning', label: 'Mornings', when: '5a–12p' },
  { id: 'afternoon', label: 'Afternoons', when: '12–5p' },
  { id: 'evening', label: 'Evenings', when: '5–9p' },
  { id: 'weekdayNight', label: 'Weeknights', when: 'Sun–Wed, 9p–5a' },
  { id: 'weekendNight', label: 'Weekend nights', when: 'Thu–Sat, 9p–5a' },
]
const PART_IDS = PARTS.map(p => p.id)
/** The grid value that means "nothing scheduled here" (AzuraCast's default plays). */
export const QUIET = '__quiet'
/** What a playlist with no saved numbers starts at. */
export const NEW_PLAYLIST_MIX = 0.5

/** Which part of the week a station-local moment falls in. */
export function partOf(dow: number, minutes: number): Part {
  const h = Math.floor(minutes / 60)
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  if (h >= 17 && h < 21) return 'evening'
  const nightDow = h >= 21 ? dow : (dow + 6) % 7 // after midnight it is still the night that began yesterday
  return nightDow >= 4 && nightDow <= 6 ? 'weekendNight' : 'weekdayNight'
}
/** How often a playlist plays in a part: the saved number, or what a new playlist starts at. */
export const mixOf = (cfg: Pick<AutoConfig, 'mix'>, name: string, part: Part): number => cfg.mix?.[plKey(name)]?.[part] ?? NEW_PLAYLIST_MIX
/** Is the album-color background on by default at this moment? True on weekend nights when the setting is on. */
export function colorOnByDefault(cfg: Pick<AutoConfig, 'colorChanging' | 'colorWeekendNights' | 'timezone'>, ms: number): boolean {
  if (cfg.colorChanging) return true
  if (cfg.colorWeekendNights === false) return false
  const p = localParts(ms, cfg.timezone)
  return partOf(p.dow, p.minutes) === 'weekendNight'
}
export const gridKey = (dow: number, hour: number) => `${dow}-${hour}`

// ── Time helpers ────────────────────────────────────────────────

/** Times of day used to learn what listeners like when. */
export type Daypart = 'morning' | 'afternoon' | 'evening' | 'night'
export const DAYPARTS: { id: Daypart; label: string }[] = [
  { id: 'morning', label: 'Morning' }, { id: 'afternoon', label: 'Afternoon' }, { id: 'evening', label: 'Evening' }, { id: 'night', label: 'Night' },
]
/** Morning 5–12, afternoon 12–17, evening 17–22, night 22–5 (station time). */
export function daypartOf(ms: number, timeZone: string): Daypart {
  const h = Math.floor(localParts(ms, timeZone).minutes / 60)
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night'
}

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
function pickGenre(pool: string[], dayKey: number, ruleId: string, wf: ((f: string) => number) | null, exclude = -1): number {
  const seed = dayKey + ruleId.length * 3
  if (!wf) {
    const idx = ((seed % pool.length) + pool.length) % pool.length
    return idx === exclude ? (idx + 1) % pool.length : idx
  }
  const w = pool.map((f, i) => (i === exclude ? 0 : Math.max(0, wf(f))))
  const total = w.reduce((a, b) => a + b, 0)
  if (total <= 0) return exclude === 0 && pool.length > 1 ? 1 : 0
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
  partWeights?: Record<string, Partial<Record<Daypart, number>>> // learned taste per genre and time of day
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
  type Raw = { startMs: number; endMs: number; ruleId: string; pool: string[]; part?: Part; oneGenre?: boolean; dayKey?: number }
  const allOn = cfg.playlists ? activePlaylists(cfg) : []
  const raw: Raw[] = []
  for (let t = first; t + step <= opts.untilMs; t += step) {
    if (taken(t, t + step)) continue
    const p = localParts(t, cfg.timezone)
    // 1) an hour set by hand always wins   2) an older custom block   3) the mix for this part of the week
    const cell = cfg.grid?.[gridKey(p.dow, Math.floor(p.minutes / 60))]
    if (cell === QUIET) continue // nothing scheduled here: the default playlist plays
    const cellName = cell ? allOn.find(a => plKey(a) === plKey(cell)) : undefined
    const rule = cellName ? undefined : cfg.rules
      .filter(r => r.enabled !== false && ruleMatches(r, p.dow, p.minutes))
      .sort((a, b) => b.priority - a.priority)[0]
    if (rule?.quiet) continue
    let ruleId: string, pool: string[], part: Part | undefined
    if (cellName) { ruleId = `grid:${cellName}`; pool = [cellName] }
    else if (rule) { ruleId = rule.id; pool = poolOf(rule.fillers.length ? rule.fillers : cfg.defaultFillers, cfg) }
    else if (cfg.playlists) { part = partOf(p.dow, p.minutes); ruleId = `part:${part}`; pool = allOn.filter(a => mixOf(cfg, a, part as Part) > 0) }
    else { ruleId = 'default'; pool = poolOf(cfg.defaultFillers, cfg) } // an older caller without a playlist list
    if (!pool.length) continue // nothing may play here (all excluded, or every number is 0): nothing is scheduled and the default playlist plays
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
      raw.push({ startMs: t, endMs: t + step, ruleId, pool, part, oneGenre: rule?.oneGenre,
        dayKey: Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000) - (startedYesterday ? 1 : 0) })
    }
  }

  // 5: choose fillers — least recently used first, never the same as the block before it
  const lastUsed = new Map<string, number>()
  const W = opts.weights ?? {}
  const PW = opts.partWeights ?? {}
  const OV = cfg.weightOverrides ?? {}
  // The weight of a playlist at a time: the manual value if there is one, else what listeners like at that time of day.
  const weightAt = (f: string, ms: number): number => {
    const k = f.toLowerCase()
    if (OV[k] !== undefined) return OV[k]
    if (!cfg.learn) return 1
    return PW[k]?.[daypartOf(ms, cfg.timezone)] ?? W[k] ?? 1
  }
  const useWeights = Object.keys(OV).length > 0 || (cfg.learn && Object.keys(W).length > 0)
  let prev = opts.lastLabel
  const usedIn = new Map<Part, Map<string, number>>()
  const picked = raw.map((b, i) => {
    if (b.oneGenre && b.dayKey !== undefined && b.pool.length) {
      // Same genre all window long (also after a show interrupts it); a different one tomorrow.
      const wf = useWeights ? (f: string) => weightAt(f, b.startMs) : null
      const idx = pickGenre(b.pool, b.dayKey, b.ruleId, wf)
      const prevIdx = b.pool.length > 1 ? pickGenre(b.pool, b.dayKey - 1, b.ruleId, wf) : -1
      // Never the same genre two nights running, unless it is the only one.
      const use = idx === prevIdx ? pickGenre(b.pool, b.dayKey, b.ruleId, wf, idx) : idx
      prev = b.pool[use]
      return { startMs: b.startMs, endMs: b.endMs, label: b.pool[use], ruleId: b.ruleId }
    }
    if (b.part && b.pool.length > 1) {
      // The mix: each playlist gets its share of this part of the week (its number, times what listeners like), so a 1 plays about twice as often as a 0.5.
      const part = b.part
      const minutes = (b.endMs - b.startMs) / 60_000
      const used = usedIn.get(part) ?? new Map<string, number>()
      usedIn.set(part, used)
      const w = b.pool.map(f => mixOf(cfg, f, part) * weightAt(f, b.startMs))
      const total = w.reduce((x, y) => x + y, 0)
      const spent = [...used.values()].reduce((x, y) => x + y, 0) + minutes
      const sc = b.pool.map((f, k) => (total > 0 ? w[k] / total : mixOf(cfg, f, part)) - (used.get(f) ?? 0) / spent + (hash(b.startMs / step + f.length) % 1000) / 1e7)
      const label = b.pool[sc.indexOf(Math.max(...sc))]
      used.set(label, (used.get(label) ?? 0) + minutes)
      lastUsed.set(label, i); prev = label
      return { startMs: b.startMs, endMs: b.endMs, label, ruleId: b.ruleId }
    }
    let options = b.pool.length > 1 ? b.pool.filter(f => f !== prev) : b.pool
    // A playlist set to 0 is skipped whenever something else can play.
    const wanted = options.filter(f => weightAt(f, b.startMs) > 0)
    if (wanted.length) options = wanted
    // Favor what listeners like, but still rotate: the longer ago a genre played, the more it counts.
    const score = (f: string) => {
      const gap = lastUsed.has(f) ? Math.min(i - (lastUsed.get(f) ?? 0), 4) : 4
      return weightAt(f, b.startMs) * (0.4 + gap * 0.15) + (hash(b.startMs / step + f.length) % 1000) / 1e6
    }
    const ranked = [...options].sort((x, y) => score(y) - score(x))
    const label = ranked[0] ?? b.pool[0]
    lastUsed.set(label, i)
    prev = label
    return { startMs: b.startMs, endMs: b.endMs, label, ruleId: b.ruleId }
  })
  // Back-to-back blocks of the same playlist read as one block (three 1-hour blocks of Jazz House are one 3-hour block).
  const merged: PlannedBlock[] = []
  for (const b of picked) {
    const last = merged[merged.length - 1]
    if (last && last.label === b.label && last.endMs === b.startMs) last.endMs = b.endMs
    else merged.push({ ...b })
  }
  return merged
}

/**
 * The mix for every playlist on the list, with each part's shares adding up to exactly 1 (two decimals). Numbers are clamped to 0–1, a missing
 * one starts at the default (or an equal share), and the part is then scaled so it adds up to 1. A part where everything is 0 becomes equal shares.
 */
export function normalizeMix(v: unknown, playlists: { name: string }[]): AutoConfig['mix'] {
  const src = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const keys = playlists.map(p => plKey(p.name))
  const out: AutoConfig['mix'] = Object.fromEntries(keys.map(k => [k, {}]))
  const n = keys.length
  for (const id of PART_IDS) {
    let vals = keys.map(k => {
      const mine = (src[k] ?? Object.entries(src).find(([name]) => plKey(name) === k)?.[1] ?? {}) as Record<string, unknown>
      const x = Number(mine[id])
      return mine[id] !== undefined && mine[id] !== null && mine[id] !== '' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : DEFAULT_CONFIG.mix[k]?.[id] ?? 1 / n
    })
    let sum = vals.reduce((a, b) => a + b, 0)
    if (sum <= 0) { vals = vals.map(() => 1); sum = n }
    const cents = vals.map(x => Math.round((x / sum) * 100))
    const diff = 100 - cents.reduce((a, b) => a + b, 0)
    if (n) cents[cents.indexOf(Math.max(...cents))] += diff // rounding drift goes to the biggest share
    keys.forEach((k, i) => { out[k][id] = cents[i] / 100 })
  }
  return out
}

/** One playlist's share in a part set to `value`; the others keep their relative sizes and fill the rest, so the part still adds up to 1. */
export function setShare(cfg: Pick<AutoConfig, 'mix' | 'playlists'>, name: string, part: Part, value: number): AutoConfig['mix'] {
  const names = (cfg.playlists ?? []).map(p => p.name)
  const k = plKey(name)
  const others = names.filter(x => plKey(x) !== k)
  const v = others.length ? Math.round(Math.min(1, Math.max(0, value)) * 100) / 100 : 1
  const rest = others.map(x => mixOf(cfg, x, part))
  const restSum = rest.reduce((a, b) => a + b, 0)
  const left = Math.round((1 - v) * 100)
  const cents = others.map((_, i) => Math.round((restSum > 0 ? rest[i] / restSum : 1 / others.length) * left))
  if (others.length) cents[cents.indexOf(Math.max(...cents))] += left - cents.reduce((a, b) => a + b, 0)
  const mix = { ...cfg.mix }
  mix[k] = { ...(mix[k] ?? {}), [part]: v }
  others.forEach((x, i) => { mix[plKey(x)] = { ...(mix[plKey(x)] ?? {}), [part]: cents[i] / 100 } })
  return mix
}

/** Hours set by hand: only real days and hours, and only playlists that are on the list (or QUIET). */
function cleanGrid(v: unknown, playlists: AutoPlaylist[]): Record<string, string> {
  const canon = new Map(playlists.map(p => [plKey(p.name), p.name]))
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries((v && typeof v === 'object' ? v : {}) as Record<string, unknown>).slice(0, 200)) {
    const m = /^([0-6])-(\d{1,2})$/.exec(k)
    if (!m || Number(m[2]) > 23) continue
    const name = typeof val === 'string' ? val.trim() : ''
    if (name === QUIET) out[`${m[1]}-${Number(m[2])}`] = QUIET
    else if (canon.has(plKey(name))) out[`${m[1]}-${Number(m[2])}`] = canon.get(plKey(name)) as string
  }
  return out
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

  // The playlist list. Missing (an older saved config) = the default two. Names are unique ignoring case.
  const seen = new Set<string>()
  const playlists: AutoPlaylist[] = Array.isArray(o.playlists)
    ? o.playlists.slice(0, 40).flatMap(x => {
        const p = (typeof x === 'string' ? { name: x } : (x ?? {})) as Record<string, unknown>
        const name = text(p.name, 40)
        if (!name || /auto\s*-?dj/i.test(name) || seen.has(plKey(name))) return []
        seen.add(plKey(name))
        return [p.enabled === false ? { name, enabled: false } : { name }]
      })
    : d.playlists.map(p => ({ ...p }))
  const canon = new Map(playlists.map(p => [plKey(p.name), p.name]))
  /** Fillers under the playlist list's own spelling and only those on the list. With nothing on the list, they are kept as they are. */
  const onList = (names: string[]) => (canon.size ? [...new Set(names.flatMap(n => (canon.has(plKey(n)) ? [canon.get(plKey(n)) as string] : [])))] : names)

  // An older saved config (before the mix existed) still carries the four stock blocks that used to be the schedule; the mix replaces them.
  const STOCK = ['study-night', 'party-night', 'wake-up', 'weekday-morning']
  const oldRules = Array.isArray(o.rules) ? o.rules : []
  const keepRules = o.mix === undefined ? oldRules.filter(r => !STOCK.includes(String((r as { id?: unknown })?.id))) : oldRules
  const rules: AutoRule[] = keepRules.slice(0, 30).flatMap((r, i) => {
    const x = (r ?? {}) as Record<string, unknown>
    const start = text(x.start, 5), end = text(x.end, 5)
    const days = (Array.isArray(x.days) ? x.days : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
    const quiet = x.quiet === true
    // A block whose playlists are all gone from the list uses every playlist that is left, so its times are kept and it shows up under them.
    const mine = list(x.fillers)
    const fillers = quiet ? mine : (() => { const keep = onList(mine); return keep.length || !canon.size ? keep : playlists.map(p => p.name) })()
    if (parseClock(start) === null || parseClock(end) === null || !days.length || (!fillers.length && !quiet)) return []
    return [{
      id: text(x.id, 40).replace(/[^a-z0-9-]/gi, '') || `rule-${i + 1}`,
      name: text(x.name, 60) || `Rule ${i + 1}`,
      days: [...new Set(days)].sort(), start, end, fillers,
      priority: clamp(x.priority, 0, 100, 10),
      ...(quiet ? { quiet: true } : {}),
      ...(x.enabled === false ? { enabled: false } : {}),
      ...(!quiet && x.oneGenre === true ? { oneGenre: true } : {}),
      ...(!quiet && Number(x.blockMinutes) > 0 ? { blockMinutes: clamp(x.blockMinutes, 30, 720, 60) } : {}),
    }]
  })

  return {
    enabled: o.enabled !== false,
    playlists,
    timezone,
    horizonHours: clamp(o.horizonHours, 6, 168, d.horizonHours),
    stepMinutes: [15, 30, 60].includes(Number(o.stepMinutes)) ? Number(o.stepMinutes) : d.stepMinutes,
    maxBlockMinutes: clamp(o.maxBlockMinutes, 30, 360, d.maxBlockMinutes),
    lockMinutes: clamp(o.lockMinutes, 0, 360, d.lockMinutes),
    syncToAzuraCast: o.syncToAzuraCast === true,
    learn: o.learn !== false,
    colorChanging: o.colorChanging === true,
    colorWeekendNights: o.colorWeekendNights !== false,
    weightOverrides: Object.fromEntries(Object.entries((o.weightOverrides ?? {}) as Record<string, unknown>).slice(0, 60)
      .map(([k, v]) => [text(k, 40).toLowerCase(), Math.round(Math.min(3, Math.max(0, Number(v))) * 100) / 100] as const)
      .filter(([k, v]) => k && Number.isFinite(v))),
    playlistMap: Object.fromEntries(Object.entries((o.playlistMap ?? {}) as Record<string, unknown>).slice(0, 60)
      .map(([k, v]) => [text(k, 40), text(v, 80)]).filter(([k, v]) => k && v)),
    mix: normalizeMix(o.mix, playlists),
    grid: cleanGrid(o.grid, playlists),
    defaultFillers: (() => { const keep = onList(list(o.defaultFillers)); return keep.length ? keep : canon.size ? playlists.map(p => p.name) : list(o.defaultFillers).length ? list(o.defaultFillers) : d.defaultFillers })(),
    rules,
  }
}


// ── Who may read and change what ────────────────────────────────
// Directors run the station day to day (rules, default playlists and the playlist list); Admins protect the machinery. The server (app/api/admin/autoschedule) and the Auto DJ page both
// use these lists. A per-rule on/off is part of `rules`, so it is a Director field.

/** What a Director may change (and read). */
export const DIRECTOR_FIELDS = ['rules', 'defaultFillers', 'playlists', 'mix', 'grid'] as const
/** What only an Admin may change. `enabled` (the master switch) is also shown to Directors, read-only. */
export const ADMIN_FIELDS = [
  'enabled', 'timezone', 'horizonHours', 'stepMinutes', 'maxBlockMinutes', 'lockMinutes', 'learn', 'colorChanging', 'colorWeekendNights', 'weightOverrides', 'syncToAzuraCast', 'playlistMap',
] as const
/** Read by Admins only, not part of the saved config: the calendar feed link. */
export const ADMIN_EXTRAS = ['calendarUrl'] as const
/** The only part of the Admin fields a Director can see, read-only. */
export const DIRECTOR_READ_ONLY = ['enabled'] as const

export type DirectorView = Pick<AutoConfig, (typeof DIRECTOR_FIELDS)[number]> & { enabled: boolean }

/** What a Director is sent: the rules and default fillers, and whether Auto DJ is on. Nothing else. */
export const directorView = (cfg: AutoConfig): DirectorView => ({ enabled: cfg.enabled, rules: cfg.rules, defaultFillers: cfg.defaultFillers, playlists: cfg.playlists, mix: cfg.mix, grid: cfg.grid })

/** Fields in a Director's request that they may not set (any key that is not a Director field, even if the value is unchanged). */
export const forbiddenForDirector = (posted: unknown): string[] =>
  Object.keys((posted && typeof posted === 'object' ? posted : {}) as object).filter(k => !(DIRECTOR_FIELDS as readonly string[]).includes(k))

/** A Director's save applied to the saved config as it is right now: only rules and defaultFillers come from the request. */
export function applyDirectorSave(current: AutoConfig, posted: unknown): AutoConfig {
  const o = (posted ?? {}) as Record<string, unknown>
  return sanitizeConfig({
    ...current,
    rules: o.rules === undefined ? current.rules : o.rules,
    defaultFillers: o.defaultFillers === undefined ? current.defaultFillers : o.defaultFillers,
    playlists: o.playlists === undefined ? current.playlists : o.playlists,
    mix: o.mix === undefined ? current.mix : o.mix,
    grid: o.grid === undefined ? current.grid : o.grid,
  })
}
