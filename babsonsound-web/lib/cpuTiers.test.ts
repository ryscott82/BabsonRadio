import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_THRESHOLDS, FEATURE_LABEL, LIMITED_GAP_MS, MIN_PROJECTION_FRAC, TIER_OF, cleanLocks, cleanThresholds, decisionFor, levelFor, pressureOf, tierStatuses,
  type Feature,
} from './cpuTiers.ts'

test('every feature has a tier, a label and a limited-mode gap', () => {
  const features = Object.keys(TIER_OF) as Feature[]
  assert.ok(features.length >= 10)
  for (const f of features) {
    assert.ok([1, 2, 3].includes(TIER_OF[f]), f)
    assert.ok(FEATURE_LABEL[f], f)
    assert.ok(LIMITED_GAP_MS[f] >= 0, f)
  }
})

test('tiers follow the plan: sign-in and /api/me are 1, presence / check-in / skip / vote / set list / ratings are 2, reactions and emoji palette are 3', () => {
  assert.equal(TIER_OF.signin, 1); assert.equal(TIER_OF.me, 1)
  for (const f of ['presence', 'listen', 'skip', 'vote', 'setlist', 'rating'] as const) assert.equal(TIER_OF[f], 2, f)
  assert.equal(TIER_OF.reactions, 3); assert.equal(TIER_OF.emojis, 3)
})

test('pressure is the larger of used and projected, and the projection only counts once a quarter of the month has passed', () => {
  assert.equal(pressureOf({ usedHours: 1, projectedHours: 3, budgetHours: 4, elapsedFrac: 0.1 }), 0.25) // too early to trust the projection
  assert.equal(pressureOf({ usedHours: 1, projectedHours: 3, budgetHours: 4, elapsedFrac: MIN_PROJECTION_FRAC }), 0.75)
  assert.equal(pressureOf({ usedHours: 3.2, projectedHours: 3.6, budgetHours: 4, elapsedFrac: 0.9 }), 0.9)
  assert.equal(pressureOf({ usedHours: 5, projectedHours: 5, budgetHours: 0, elapsedFrac: 1 }), 0)
})

test('tier 3 steps up first, then tier 2, and tier 1 only at the very end', () => {
  const at = (p: number) => ([1, 2, 3] as const).map(t => levelFor(t, p))
  assert.deepEqual(at(0.3), ['normal', 'normal', 'normal'])
  assert.deepEqual(at(0.55), ['normal', 'normal', 'tight'])
  assert.deepEqual(at(0.75), ['normal', 'tight', 'critical'])
  assert.deepEqual(at(0.72), ['normal', 'normal', 'critical'])
  assert.deepEqual(at(0.8), ['normal', 'tight', 'critical'])
  assert.deepEqual(at(0.92), ['normal', 'critical', 'critical'])
  assert.deepEqual(at(0.99), ['critical', 'critical', 'critical'])
})

test('tier 1 has no "tight" level of its own: it only throttles at critical', () => {
  for (const p of [0, 0.5, 0.9, 0.96]) assert.equal(levelFor(1, p), 'normal')
  assert.equal(levelFor(1, DEFAULT_THRESHOLDS[1].critical), 'critical')
})

test('an admin lock beats the meter, in both directions', () => {
  assert.equal(levelFor(2, 0.1, DEFAULT_THRESHOLDS, 'critical'), 'critical')
  assert.equal(levelFor(3, 5, DEFAULT_THRESHOLDS, 'normal'), 'normal')
  const st = tierStatuses(0.8, DEFAULT_THRESHOLDS, { 2: 'normal' })
  assert.equal(st[2].level, 'normal'); assert.equal(st[2].locked, true); assert.match(st[2].reason, /admin/)
  assert.equal(st[3].level, 'critical'); assert.equal(st[3].locked, false); assert.match(st[3].reason, /80%/)
  assert.equal(tierStatuses(0.1)[3].reason, '')
})

test('level -> what a route does: normal goes, tight is rate limited, critical is off', () => {
  assert.equal(decisionFor('normal'), 'go')
  assert.equal(decisionFor('tight'), 'limited')
  assert.equal(decisionFor('critical'), 'off')
})

test('thresholds from the admin are cleaned: bad numbers fall back, critical never sits below tight', () => {
  const t = cleanThresholds({ 3: { tight: 0.4, critical: 0.6 }, 2: { tight: 'x', critical: 0.95 }, 1: { tight: 0.9, critical: 0.5 } })
  assert.deepEqual(t[3], { tight: 0.4, critical: 0.6 })
  assert.deepEqual(t[2], { tight: DEFAULT_THRESHOLDS[2].tight, critical: 0.95 })
  assert.deepEqual(t[1], { tight: 0.9, critical: 0.9 })
  assert.deepEqual(cleanThresholds(null), DEFAULT_THRESHOLDS)
  assert.deepEqual(cleanThresholds({ 3: { tight: -1, critical: 99 } })[3], DEFAULT_THRESHOLDS[3])
})

test('locks from the admin keep only real tiers and levels', () => {
  assert.deepEqual(cleanLocks({ 1: 'normal', 2: 'critical', 3: 'tight', 4: 'critical' }), { 1: 'normal', 2: 'critical', 3: 'tight' })
  assert.deepEqual(cleanLocks({ 2: 'auto', 3: null, 1: 'off' }), {})
  assert.deepEqual(cleanLocks('x'), {})
})

test('now playing backup way: default auto, switches on at the set share of the allowance, off never, on always', async () => {
  const { DEFAULT_DIRECT_AT, cleanDirectAt, cleanDirectMode, directActive } = await import('./cpuTiers.ts')
  assert.equal(cleanDirectMode(undefined), 'auto')
  assert.equal(cleanDirectMode('banana'), 'auto')
  assert.equal(cleanDirectMode('off'), 'off')
  assert.equal(cleanDirectAt(0.5), 0.5)
  for (const bad of [0, 0.05, 3, NaN, '0.5', null]) assert.equal(cleanDirectAt(bad), DEFAULT_DIRECT_AT)
  assert.equal(directActive('auto', 0.2, DEFAULT_DIRECT_AT), false) // normal days: nothing changes
  assert.equal(directActive('auto', DEFAULT_DIRECT_AT, DEFAULT_DIRECT_AT), true)
  assert.equal(directActive('off', 5, DEFAULT_DIRECT_AT), false)
  assert.equal(directActive('on', 0, DEFAULT_DIRECT_AT), true)
})
