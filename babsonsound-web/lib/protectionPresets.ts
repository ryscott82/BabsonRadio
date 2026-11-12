import { DEFAULT_DIRECT_AT, DEFAULT_THRESHOLDS } from './cpuTiers.ts'

// "Protection level" (Admin > Server load): one choice that sets the server-time tier thresholds, the reactions share and the direct-feed point together.
//   Normal = today's values (the defaults in lib/cpuTiers.ts and lib/server/cpuBudget.ts).
//   Relaxed = 1.25 x Normal (features slow down later), Strict = 0.75 x Normal (they slow down earlier).
// Each value is clamped to the same min and max the server enforces. A step that is 1 (100%) or lower in Normal never goes above 1 in Relaxed, so Relaxed can not
// turn a "turn off at" step into "never". The table is shared by the PATCH route (lib/adminSettings.ts), the page and the tests.

export type Preset = 'relaxed' | 'normal' | 'strict'
export const PRESETS: readonly Preset[] = ['relaxed', 'normal', 'strict']
export const FACTOR: Record<Preset, number> = { relaxed: 1.25, normal: 1, strict: 0.75 }
export const DEFAULT_REACTION_SHARE = 0.25

/** The values a preset writes: [key, Normal value, min, max]. Keys are the settings keys in lib/adminSettings.ts. */
export const PROTECTION_PARTS: readonly { key: string; normal: number; min: number; max: number }[] = [
  ...([3, 2, 1] as const).flatMap(t => (['tight', 'critical'] as const).map(k => ({ key: `cpu.th.${t}.${k}`, normal: DEFAULT_THRESHOLDS[t][k], min: 0.01, max: 10 }))),
  { key: 'cpu.reactionShare', normal: DEFAULT_REACTION_SHARE, min: 0.01, max: 1 },
  { key: 'cpu.directAt', normal: DEFAULT_DIRECT_AT, min: 0.1, max: 2 },
]
export const PROTECTION_KEYS = PROTECTION_PARTS.map(p => p.key)

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** The value of one part under a preset. */
export function presetValue(p: (typeof PROTECTION_PARTS)[number], preset: Preset): number {
  const hi = p.normal <= 1 && p.key.startsWith('cpu.th.') ? Math.min(1, p.max) : p.max
  return Math.min(hi, Math.max(p.min, round3(p.normal * FACTOR[preset])))
}

export const presetValues = (preset: Preset): Record<string, number> => Object.fromEntries(PROTECTION_PARTS.map(p => [p.key, presetValue(p, preset)]))

/** Which preset the stored values match exactly, or 'custom'. */
export function protectionOf(get: (key: string) => number): Preset | 'custom' {
  for (const preset of PRESETS) if (PROTECTION_PARTS.every(p => Math.abs(get(p.key) - presetValue(p, preset)) < 1e-9)) return preset
  return 'custom'
}
