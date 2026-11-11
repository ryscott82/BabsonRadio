import 'server-only'
import { LIMITED_GAP_MS, TIER_OF, decisionFor, type Feature, type Level } from '../cpuTiers'
import { createLastKnown } from '../lastKnown'
import { cpuState } from './cpuBudget'

// The one place a route asks "may I do this work right now?" (see lib/cpuTiers.ts for the tiers).
//   normal    the work runs and its answer is remembered
//   tight     one person gets fresh work at most once per LIMITED_GAP_MS[feature]; in between they get the remembered answer
//   critical  no work at all: the remembered answer, or the `empty` one the route gives
// The answer always has the normal shape, so nobody sees an error. The memory is per server instance and per person.
const memory = createLastKnown<unknown>(5000)

/** The level of a feature's tier right now. Never throws: if the meter cannot be read, everything stays on. */
export async function levelOf(feature: Feature): Promise<Level> {
  try { return (await cpuState()).tiers[TIER_OF[feature]].level } catch { return 'normal' }
}

/** `empty` is what a switched-off feature answers when nothing is remembered yet; pass `undefined` for features that must still run then (sign-in, /api/me). */
export async function throttled<T>(feature: Feature, uid: string, empty: T | undefined, work: () => Promise<T>, variant = ''): Promise<T> {
  const key = `${feature}${variant}:${uid}`
  const level = await levelOf(feature)
  const mode = decisionFor(level)
  if (mode === 'go') { const v = await work(); memory.remember(key, v); return v }
  if (mode === 'limited') {
    const hit = memory.recall(key, LIMITED_GAP_MS[feature])
    if (hit !== undefined) return hit as T
    const v = await work(); memory.remember(key, v); return v
  }
  const last = memory.peek(key)
  return last ? (last.value as T) : empty !== undefined ? empty : work()
}

/** For parts of a bigger reply (a section of the bundle): true when the work may run now. A refused section is left out like a failed one. */
export async function mayRun(feature: Feature, uid: string): Promise<boolean> {
  const mode = decisionFor(await levelOf(feature))
  if (mode === 'go') return true
  if (mode === 'off') return false
  return memory.allow(`${feature}:${uid}`, LIMITED_GAP_MS[feature])
}

export const forgetThrottled = () => memory.clear()
