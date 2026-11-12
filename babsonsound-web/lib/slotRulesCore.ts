import { DEFAULT_AUTO_RULES, type AutoRules } from './slotAuto.ts'

// Allowed ranges for the show-request numbers (whole numbers). Shared by the settings table and the loader, so a bad stored value falls back to the default.
export const SLOT_RANGE: Record<keyof AutoRules, [number, number]> = {
  afterHours: [1, 72], beforeStartHours: [1, 72], weekLimit: [1, 7], maxRepeatWeeks: [0, 8], minLeadHours: [0, 168],
}
export const SLOT_SETTING_KEYS = Object.keys(SLOT_RANGE) as (keyof AutoRules)[]

/** Reads the stored document; anything missing or out of range uses the default. */
export function readSlotRules(raw: unknown): AutoRules {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_AUTO_RULES }
  for (const k of SLOT_SETTING_KEYS) {
    const v = d[k], [lo, hi] = SLOT_RANGE[k]
    if (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi) out[k] = v
  }
  return out
}
