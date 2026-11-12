// The logic behind one row on Admin > Settings: is it changed from its default, what does Reset do, does saving need a confirm step.
// Pure (no React, no fetch), so the tests cover it.

export type SettingValue = number | boolean | string
export type SettingKind = 'number' | 'boolean' | 'hour' | 'choice' | 'text' | 'date'
/** Level 1 = everyday switch, level 2 = changes how something works day to day. Level 3 = could hurt every listener if wrong, so saving asks "are you sure". */
export type SettingLevel = 1 | 2 | 3
export type SettingTier = 'everyday' | 'customize' | 'defaults'

export interface SettingDef {
  id: string
  tier: SettingTier
  level: SettingLevel
  label: string
  /** Plain words: what it does. */
  help: string
  kind: SettingKind
  default: SettingValue
  /** number: allowed range and the unit shown after it. `scale` shows a stored fraction as a percent (0.75 -> 75). */
  min?: number; max?: number; unit?: string; scale?: number
  /** The server keeps this value but nothing uses it right now (shown as "Not enforced right now"). */
  notEnforced?: boolean
  /** main: its own card on the page it controls. expert: in that page's closed Expert fold. */
  visible?: 'main' | 'expert'
  /** The server only accepts whole numbers. */
  integer?: boolean
  choices?: { value: string; label: string }[]
  /** Level 3: who feels a change ("Every listener"). Used in the confirm step. */
  affects?: string
  /** Level 3: one line on what happens if it is wrong. */
  risk?: string
  /** Where the page groups it, and extra words the search matches. */
  group: string
  keywords?: string
}

export const same = (a: SettingValue | undefined, b: SettingValue | undefined) => a === b

/** True when the saved value is not the default. A value that has not loaded yet is never "changed". */
export function isChanged(def: SettingDef, value: SettingValue | undefined): boolean {
  return value !== undefined && !same(value, def.default)
}

/** What Reset to default saves. */
export const resetValue = (def: SettingDef): SettingValue => def.default

/** Reset is offered only when there is something to reset. */
export const canReset = isChanged

/** Level 3 values always ask before saving, including Reset. */
export const needsConfirm = (def: SettingDef) => def.level === 3

/** The unit-aware text shown for a stored value ("75%", "12 minutes", "On", "9 AM"). */
export function formatValue(def: SettingDef, v: SettingValue | undefined): string {
  if (v === undefined) return '…'
  if (def.kind === 'boolean') return v ? 'On' : 'Off'
  if (def.kind === 'choice') return def.choices?.find(c => c.value === v)?.label ?? String(v)
  if (def.kind === 'hour') { const h = Number(v); return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}` }
  if (def.kind === 'text' || def.kind === 'date') return String(v)
  const n = Number(v) * (def.scale ?? 1)
  const shown = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
  return def.unit ? `${shown}${def.unit === '%' ? '%' : ` ${def.unit}`}` : shown
}

/** The number shown in the box (a percent for scaled values) and the stored value it comes from. */
export const toInput = (def: SettingDef, v: SettingValue): string => (def.kind === 'number' ? String(Math.round(Number(v) * (def.scale ?? 1) * 100) / 100) : String(v))
export function fromInput(def: SettingDef, text: string): SettingValue | null {
  if (def.kind !== 'number') return null
  if (text.trim() === '') return null
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  return Math.round((n / (def.scale ?? 1)) * 10000) / 10000
}

/** An error message for a value that cannot be saved, or null. Numbers must be whole (or a percent) and inside the range. */
export function validate(def: SettingDef, v: SettingValue | null): string | null {
  if (v === null) return def.kind === 'number' ? 'Enter a number.' : 'Choose a value.'
  if (def.kind === 'number') {
    const n = Number(v)
    if (!Number.isFinite(n)) return 'Enter a number.'
    const lo = def.min, hi = def.max
    if (lo !== undefined && n < lo - 1e-9) return `Must be at least ${formatValue(def, lo)}.`
    if (hi !== undefined && n > hi + 1e-9) return `Must be at most ${formatValue(def, hi)}.`
    if (def.integer && !Number.isInteger(n)) return 'Use a whole number.'
  }
  if (def.kind === 'hour') { const h = Number(v); if (!Number.isInteger(h) || h < 0 || h > 23) return 'Choose an hour.' }
  if (def.kind === 'choice' && !def.choices?.some(c => c.value === v)) return 'Choose one of the options.'
  if (def.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return 'Choose a date.'
  if (def.kind === 'text' && String(v).trim() === '') return 'Enter some text.'
  return null
}

/** The sentence in the confirm step of a Level 3 value: who is affected and what changes. */
export function confirmText(def: SettingDef, next: SettingValue, current?: SettingValue): { title: string; body: string; action: string } {
  const toDefault = same(next, def.default)
  return {
    title: toDefault ? `Reset “${def.label}” to its default?` : `Change “${def.label}”?`,
    body: `${def.affects ? `This affects ${def.affects}. ` : ''}It will change${current === undefined ? '' : ` from ${formatValue(def, current)}`} to ${formatValue(def, next)} (default: ${formatValue(def, def.default)}).${def.risk ? ` ${def.risk}` : ''}`,
    action: toDefault ? 'Reset' : 'Change it',
  }
}

/** The rows a "Changed from default" filter keeps: only changed ones. */
export function changedOnly<T extends { def: SettingDef; value: SettingValue | undefined }>(rows: T[]): T[] {
  return rows.filter(r => isChanged(r.def, r.value))
}

/** Words typed in the search box must all appear in a setting's label, help, group or keywords. */
export function settingMatches(def: SettingDef, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = `${def.label} ${def.help} ${def.group} ${def.keywords ?? ''}`.toLowerCase()
  return words.every(w => hay.includes(w))
}

/** The body of the one PATCH call: a value to save, or null to put the setting back to its default (the server fills in the default). */
export function patchBody(id: string, next: SettingValue | null): { changes: Record<string, SettingValue | null> } {
  return { changes: { [id]: next } }
}
/** What a row sends: Reset sends null, a normal save sends the value as typed (a choice that is a number on the server goes as text, which it accepts). */
export function valueToSend(next: SettingValue, reset: boolean): SettingValue | null {
  return reset ? null : next
}
