import { DEFAULT_AUDIENCE, DEFAULT_LIMITS } from './listenLimits.ts'
import { DEFAULT_DIRECT_AT, DEFAULT_THRESHOLDS } from './cpuTiers.ts'
import { DEFAULT_AUTO_RULES } from './slotAuto.ts'
import { SLOT_RANGE } from './slotRulesCore.ts'
import { PRESETS, presetValues, protectionOf, type Preset } from './protectionPresets.ts'
import { DEFAULT_STUDIO, STUDIO_RANGE, checkQuietSpec, isIsoDate } from './studioBookCore.ts'

// The one table behind Admin > Settings: every value the page can change, its default and its allowed range. Pure, so the routes, the page
// and the tests share it. Each key points at the field the existing endpoint already stores (limits = usage/limits, cpu = usage/cpuConfig,
// auto = config/autoScheduler, slots = config/slotRules), so nothing about what is stored changes.

export type Store = 'limits' | 'cpu' | 'auto' | 'slots' | 'studio'
export type Kind = 'bool' | 'int' | 'num' | 'enum' | 'date' | 'text'
/** 1 = Everyday, 2 = Customize, 3 = Defaults and safety (the page asks before saving these). */
export type Level = 1 | 2 | 3
export type Value = boolean | number | string

/** Where the page shows a setting: 'main' on its own page, 'expert' only in the closed Expert box. */
export type Visible = 'main' | 'expert'

interface RawDef {
  key: string
  label: string
  store: Store
  /** Where the value sits inside that store's document. */
  path: string[]
  kind: Kind
  min?: number
  max?: number
  options?: readonly (string | number)[]
  default: Value
  level: Level
  /** A setting that is worked out from other settings (cpu.protection): it has no stored value of its own and a patch expands into the real ones. */
  virtual?: true
  /** Extra check for a text value: an error sentence, or null when it is fine. */
  check?: (v: string) => string | null
}

export interface SettingDef extends RawDef {
  visible: Visible
  /** false: the value is saved but nothing in the server uses it right now (the page says "Not enforced right now"). */
  enforced: boolean
}

const aud = (who: 'student' | 'guest'): RawDef[] => {
  const w = who === 'student' ? 'Students' : 'Guests'
  const d = DEFAULT_AUDIENCE
  const mk = (k: keyof typeof d, label: string, kind: Kind, min?: number, max?: number): RawDef => ({
    key: `limits.${who}.${k}`, label: `${w}: ${label}`, store: 'limits', path: [who, k], kind, min, max, default: d[k], level: 3,
  })
  return [
    mk('idleMin', 'ask "still listening?" after (minutes, 0 = never)', 'int', 0, 1440),
    mk('sessionMaxMin', 'longest session (minutes, 0 = no limit)', 'int', 0, 10080),
    mk('dailyCapMin', 'daily listening cap (minutes, 0 = no limit)', 'int', 0, 1440),
    mk('dailyAutoMin', 'daily playlist cap (minutes, 0 = no limit)', 'int', 0, 1440),
    mk('quietEnabled', 'overnight quiet hours', 'bool'),
    mk('quietStart', 'quiet hours start (hour, 0 to 23)', 'int', 0, 23),
    mk('quietEnd', 'quiet hours end (hour, 0 to 23)', 'int', 0, 23),
  ]
}

const th = (tier: 1 | 2 | 3, k: 'tight' | 'critical'): RawDef => ({
  key: `cpu.th.${tier}.${k}`, label: `Tier ${tier} ${k} level (share of the allowance, above 1 = never by itself)`, store: 'cpu', path: ['thresholds', String(tier), k],
  kind: 'num', min: 0.01, max: 10, default: DEFAULT_THRESHOLDS[tier][k], level: 3,
})

const RAW: readonly RawDef[] = [
  { key: 'limits.budgetEnabled', label: 'Also apply the monthly listener-hours budget', store: 'limits', path: ['budgetEnabled'], kind: 'bool', default: DEFAULT_LIMITS.budgetEnabled, level: 3 },
  { key: 'limits.refreshSec', label: 'Seconds between listening check-ins', store: 'limits', path: ['refreshSec'], kind: 'int', min: 120, max: 3600, default: DEFAULT_LIMITS.refreshSec, level: 3 },
  ...aud('student'), ...aud('guest'),
  { key: 'cpu.budgetHours', label: 'Server-time allowance per month (hours)', store: 'cpu', path: ['budgetHours'], kind: 'num', min: 0.1, max: 10000, default: 4, level: 3 },
  { key: 'cpu.reactionShare', label: 'Most the reactions may use (share of the allowance)', store: 'cpu', path: ['reactionShare'], kind: 'num', min: 0.01, max: 1, default: 0.25, level: 3 },
  { key: 'cpu.baseHours', label: 'Hours already counted by Vercel', store: 'cpu', path: ['baseHours'], kind: 'num', min: 0, max: 10000, default: 0, level: 2 },
  { key: 'cpu.reactionsLocked', label: 'Switch reactions off', store: 'cpu', path: ['reactionsLocked'], kind: 'bool', default: false, level: 2 },
  { key: 'cpu.auto', label: 'Ease features off automatically as the month fills', store: 'cpu', path: ['auto'], kind: 'bool', default: true, level: 3 },
  { key: 'cpu.nowPlayingDirect', label: 'Now playing: read straight from the stream server', store: 'cpu', path: ['nowPlayingDirect'], kind: 'enum', options: ['auto', 'off', 'on'], default: 'auto', level: 3 },
  { key: 'cpu.directAt', label: 'Switch to the direct feed at (share of the allowance)', store: 'cpu', path: ['directAt'], kind: 'num', min: 0.1, max: 2, default: DEFAULT_DIRECT_AT, level: 3 },
  ...([3, 2, 1] as const).flatMap(t => [th(t, 'tight'), th(t, 'critical')]),
  { key: 'cpu.protection', label: 'Protection level', store: 'cpu', path: [], kind: 'enum', options: PRESETS, default: 'normal', level: 3, virtual: true },
  { key: 'slots.afterHours', label: 'Show requests approve themselves after (hours)', store: 'slots', path: ['afterHours'], kind: 'int', min: SLOT_RANGE.afterHours[0], max: SLOT_RANGE.afterHours[1], default: DEFAULT_AUTO_RULES.afterHours, level: 3 },
  { key: 'slots.beforeStartHours', label: 'Latest an automatic approval can be before the show (hours)', store: 'slots', path: ['beforeStartHours'], kind: 'int', min: SLOT_RANGE.beforeStartHours[0], max: SLOT_RANGE.beforeStartHours[1], default: DEFAULT_AUTO_RULES.beforeStartHours, level: 3 },
  { key: 'slots.weekLimit', label: 'Automatic approvals per person each week', store: 'slots', path: ['weekLimit'], kind: 'int', min: SLOT_RANGE.weekLimit[0], max: SLOT_RANGE.weekLimit[1], default: DEFAULT_AUTO_RULES.weekLimit, level: 3 },
  { key: 'slots.maxRepeatWeeks', label: 'Most extra weeks a request can repeat (0 = off)', store: 'slots', path: ['maxRepeatWeeks'], kind: 'int', min: SLOT_RANGE.maxRepeatWeeks[0], max: SLOT_RANGE.maxRepeatWeeks[1], default: DEFAULT_AUTO_RULES.maxRepeatWeeks, level: 3 },
  { key: 'slots.minLeadHours', label: 'Fewest hours ahead a show can be requested', store: 'slots', path: ['minLeadHours'], kind: 'int', min: SLOT_RANGE.minLeadHours[0], max: SLOT_RANGE.minLeadHours[1], default: DEFAULT_AUTO_RULES.minLeadHours, level: 3 },
  { key: 'studio.capacity', label: 'Most people in the studio at once, including the booker', store: 'studio', path: ['capacity'], kind: 'int', min: STUDIO_RANGE.capacity[0], max: STUDIO_RANGE.capacity[1], default: DEFAULT_STUDIO.capacity, level: 2 },
  { key: 'studio.openHour', label: 'Studio bookings open at (hour, 0 to 23)', store: 'studio', path: ['openHour'], kind: 'int', min: STUDIO_RANGE.openHour[0], max: STUDIO_RANGE.openHour[1], default: DEFAULT_STUDIO.openHour, level: 3 },
  { key: 'studio.closeHour', label: 'Studio bookings close at (hour, 1 to 24)', store: 'studio', path: ['closeHour'], kind: 'int', min: STUDIO_RANGE.closeHour[0], max: STUDIO_RANGE.closeHour[1], default: DEFAULT_STUDIO.closeHour, level: 3 },
  { key: 'studio.minMinutes', label: 'Shortest studio booking (minutes)', store: 'studio', path: ['minMinutes'], kind: 'int', min: STUDIO_RANGE.minMinutes[0], max: STUDIO_RANGE.minMinutes[1], default: DEFAULT_STUDIO.minMinutes, level: 3 },
  { key: 'studio.maxMinutes', label: 'Longest studio booking (minutes)', store: 'studio', path: ['maxMinutes'], kind: 'int', min: STUDIO_RANGE.maxMinutes[0], max: STUDIO_RANGE.maxMinutes[1], default: DEFAULT_STUDIO.maxMinutes, level: 3 },
  { key: 'studio.maxHolds', label: 'Studio bookings one person can hold at a time', store: 'studio', path: ['maxHolds'], kind: 'int', min: STUDIO_RANGE.maxHolds[0], max: STUDIO_RANGE.maxHolds[1], default: DEFAULT_STUDIO.maxHolds, level: 3 },
  { key: 'studio.lookAheadDays', label: 'How far ahead the studio can be booked (days)', store: 'studio', path: ['lookAheadDays'], kind: 'int', min: STUDIO_RANGE.lookAheadDays[0], max: STUDIO_RANGE.lookAheadDays[1], default: DEFAULT_STUDIO.lookAheadDays, level: 3 },
  { key: 'studio.cancelHours', label: 'Free cancel until this many hours before a studio booking', store: 'studio', path: ['cancelHours'], kind: 'int', min: STUDIO_RANGE.cancelHours[0], max: STUDIO_RANGE.cancelHours[1], default: DEFAULT_STUDIO.cancelHours, level: 3 },
  { key: 'studio.graceMinutes', label: 'Minutes after the start before an unused booking is released', store: 'studio', path: ['graceMinutes'], kind: 'int', min: STUDIO_RANGE.graceMinutes[0], max: STUDIO_RANGE.graceMinutes[1], default: DEFAULT_STUDIO.graceMinutes, level: 3 },
  { key: 'studio.quiet', label: 'Studio quiet hours (days and hours, e.g. Mon-Fri 10-16:30; Mon-Fri 23-7; Sat-Sun 2-8)', store: 'studio', path: ['quiet'], kind: 'text', default: DEFAULT_STUDIO.quiet, level: 3, check: checkQuietSpec },
  { key: 'strikes.studioNoShow', label: 'A missed studio booking flags a strike for review', store: 'studio', path: ['studioNoShow'], kind: 'bool', default: DEFAULT_STUDIO.studioNoShow, level: 3 },
  { key: 'strikes.semesterEnd', label: 'Strikes expire at the end of the semester (date)', store: 'studio', path: ['semesterEnd'], kind: 'date', default: DEFAULT_STUDIO.semesterEnd, level: 3 },
  { key: 'strikes.lateCancelHours', label: 'Cancelling a show less than this many hours ahead is flagged', store: 'studio', path: ['lateCancelHours'], kind: 'int', min: STUDIO_RANGE.lateCancelHours[0], max: STUDIO_RANGE.lateCancelHours[1], default: DEFAULT_STUDIO.lateCancelHours, level: 3 },
  { key: 'auto.enabled', label: 'Auto DJ schedule on', store: 'auto', path: ['enabled'], kind: 'bool', default: true, level: 1 },
  { key: 'auto.horizonHours', label: 'Plan ahead (hours)', store: 'auto', path: ['horizonHours'], kind: 'int', min: 6, max: 168, default: 48, level: 2 },
  { key: 'auto.stepMinutes', label: 'Planning step (minutes)', store: 'auto', path: ['stepMinutes'], kind: 'enum', options: [15, 30, 60], default: 30, level: 3 },
  { key: 'auto.maxBlockMinutes', label: 'Longest playlist block (minutes)', store: 'auto', path: ['maxBlockMinutes'], kind: 'int', min: 30, max: 360, default: 60, level: 3 },
  { key: 'auto.lockMinutes', label: 'Leave the next minutes of the plan alone', store: 'auto', path: ['lockMinutes'], kind: 'int', min: 0, max: 360, default: 60, level: 3 },
  { key: 'auto.syncToAzuraCast', label: 'Send the plan to the stream server', store: 'auto', path: ['syncToAzuraCast'], kind: 'bool', default: false, level: 3 },
  { key: 'auto.learn', label: 'Lean toward what listeners enjoy', store: 'auto', path: ['learn'], kind: 'bool', default: true, level: 2 },
  { key: 'auto.colorChanging', label: 'Colour-changing schedule blocks', store: 'auto', path: ['colorChanging'], kind: 'bool', default: false, level: 2 },
]

/** On a page of its own (main): the values a person plausibly changes in a normal month. Everything else is Expert. */
const MAIN = new Set([
  ...(['student', 'guest'] as const).flatMap(w => ['idleMin', 'sessionMaxMin', 'quietEnabled', 'quietStart', 'quietEnd'].map(k => `limits.${w}.${k}`)),
  'slots.afterHours', 'slots.weekLimit', 'cpu.budgetHours', 'cpu.protection', 'cpu.reactionsLocked', 'studio.capacity',
])
/** Saved, but nothing in the server uses them right now (the server no longer counts listening minutes against a daily cap). */
const NOT_ENFORCED = new Set(['limits.student.dailyCapMin', 'limits.student.dailyAutoMin', 'limits.guest.dailyCapMin', 'limits.guest.dailyAutoMin'])

export const SETTINGS: readonly SettingDef[] = RAW.map(d => ({ ...d, visible: MAIN.has(d.key) ? 'main' as const : 'expert' as const, enforced: !NOT_ENFORCED.has(d.key) }))

export const BY_KEY: ReadonlyMap<string, SettingDef> = new Map(SETTINGS.map(s => [s.key, s]))

/** Checks one posted value against its definition. Returns the clean value, or an error message. */
export function checkValue(def: RawDef, v: unknown): { ok: true; value: Value } | { ok: false; error: string } {
  const bad = (m: string) => ({ ok: false as const, error: `${def.key}: ${m}` })
  if (def.kind === 'bool') return typeof v === 'boolean' ? { ok: true, value: v } : bad('must be true or false.')
  if (def.kind === 'date') return isIsoDate(v) ? { ok: true, value: v } : bad('must be a date like 2026-12-18.')
  if (def.kind === 'text') {
    if (typeof v !== 'string') return bad('must be text.')
    const t = v.trim()
    if (t.length > 120) return bad('is too long (120 characters at most).')
    const e = def.check?.(t)
    return e ? bad(e) : { ok: true, value: t }
  }
  if (def.kind === 'enum') {
    // Numbers that are listed (15, 30, 60) may also arrive as text ("30"), which is how the page's choice lists hold them.
    const hit = def.options!.find(o => o === v || (typeof o === 'number' && typeof v === 'string' && v.trim() !== '' && Number(v) === o))
    return hit !== undefined ? { ok: true, value: hit } : bad(`must be one of ${def.options!.join(', ')}.`)
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return bad('must be a number.')
  if (def.kind === 'int' && !Number.isInteger(v)) return bad('must be a whole number.')
  if (v < def.min! || v > def.max!) return bad(`must be from ${def.min} to ${def.max}.`)
  return { ok: true, value: v }
}

export type Patch = Record<string, unknown>
export interface Change { key: string; old: Value; new: Value }

/**
 * Validates a patch ({ key: value }, or { key: null } to go back to the default) against the table and the current values.
 * Returns only the keys that really change (the same value saved again is not a change, so it is not logged).
 */
export function planPatch(current: Record<string, Value>, patch: unknown): { changes: Change[]; errors: string[] } {
  const errors: string[] = [], changes: Change[] = []
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { changes, errors: ['Send { "key": value } for each setting to change.'] }
  // A preset (cpu.protection) is expanded first, so a value named in the same save wins over it.
  const entries = Object.entries(patch as Patch).sort((a, b) => Number(BY_KEY.get(b[0])?.virtual === true) - Number(BY_KEY.get(a[0])?.virtual === true))
  if (!entries.length) errors.push('Nothing to change.')
  if (entries.length > SETTINGS.length) errors.push('Too many settings in one save.')
  const next: Record<string, Value> = { ...current }
  for (const [key, raw] of entries) {
    const def = BY_KEY.get(key)
    if (!def) { errors.push(`${key}: not a setting.`); continue }
    let value: Value
    if (raw === null) value = def.default
    else { const r = checkValue(def, raw); if (!r.ok) { errors.push(r.error); continue } value = r.value }
    if (def.virtual) {
      // A preset writes every value it stands for (one line each in the history); the preset itself is not logged.
      for (const [k, v] of Object.entries(presetValues(value as Preset))) { next[k] = v; if (v !== current[k]) changes.push({ key: k, old: current[k], new: v }) }
      next[key] = value
      continue
    }
    next[key] = value
    const at = changes.findIndex(c => c.key === key) // a value set by a preset and by name in the same save: the named one wins
    if (at >= 0) changes.splice(at, 1)
    if (value !== current[key]) changes.push({ key, old: current[key], new: value })
  }
  // The pairs that only make sense together.
  // Same rule as lib/cpuTiers.ts cleanThresholds: critical is never below tight (a tight above 1 means "no tight stage").
  for (const tier of [3, 2, 1] as const) {
    const t = next[`cpu.th.${tier}.tight`] as number, c = next[`cpu.th.${tier}.critical`] as number
    if (typeof t === 'number' && typeof c === 'number' && t <= 1 && c < t) errors.push(`cpu.th.${tier}: critical must not be below tight.`)
  }
  const open = next['studio.openHour'] as number, close = next['studio.closeHour'] as number
  if (typeof open === 'number' && typeof close === 'number' && close <= open) errors.push('studio.closeHour: must be later than studio.openHour.')
  const lo = next['studio.minMinutes'] as number, hi = next['studio.maxMinutes'] as number
  if (typeof lo === 'number' && typeof hi === 'number' && hi < lo) errors.push('studio.maxMinutes: must not be below studio.minMinutes.')
  return { changes: errors.length ? [] : changes, errors }
}

/** Reads one value out of a stored document by its path; anything missing or invalid falls back to the default. */
export function readValue(def: RawDef, doc: unknown): Value {
  if (def.virtual) return protectionOf(k => Number(readValue(BY_KEY.get(k)!, doc))) // the preset the stored values match, or 'custom'
  let cur: unknown = doc
  for (const p of def.path) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[p] : undefined
  const r = checkValue(def, cur)
  return r.ok ? r.value : def.default
}

export const defaultsOf = (): Record<string, Value> => Object.fromEntries(SETTINGS.map(s => [s.key, s.default]))

/** One line of the settings history, kept small. */
export const clipLog = (c: Change, by: string, at: number) => ({ at, by: by.slice(0, 120), key: c.key, old: c.old, new: c.new })

/** Auto DJ values that are saved by an Admin but are not rows in the table (text and maps), logged as short text. */
const EXTRA_AUTO = ['timezone', 'weightOverrides', 'playlistMap'] as const
const short = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v ?? null)).slice(0, 300)

/**
 * What an Admin's Auto DJ save changed, one entry per changed value, in the same shape PATCH logs. Rules and default fillers (the Director part)
 * are not listed. `before` and `after` are saved configs.
 */
export function autoChanges(before: unknown, after: unknown): Change[] {
  const out: Change[] = []
  for (const def of SETTINGS.filter(s => s.store === 'auto')) {
    const o = readValue(def, before), n = readValue(def, after)
    if (o !== n) out.push({ key: def.key, old: o, new: n })
  }
  const b = (before ?? {}) as Record<string, unknown>, a = (after ?? {}) as Record<string, unknown>
  for (const k of EXTRA_AUTO) {
    const o = short(b[k]), n = short(a[k])
    if (o !== n) out.push({ key: `auto.${k}`, old: o, new: n })
  }
  return out
}

/** Changes between two saved documents of one store (the older pages save whole documents; this lists what moved). */
export function storeChanges(store: Store, before: unknown, after: unknown): Change[] {
  const out: Change[] = []
  for (const def of SETTINGS.filter(s => s.store === store && !s.virtual)) {
    const o = readValue(def, before), n = readValue(def, after)
    if (o !== n) out.push({ key: def.key, old: o, new: n })
  }
  return out
}
